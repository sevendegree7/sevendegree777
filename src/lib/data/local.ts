"use client";

import type { KitchenOrder } from "@/lib/kds/orders";
import {
  isBoxProduct,
  validateBoxContents,
} from "@/lib/pos/box";
import { cartTotal, lineUnitPrice, type PricedLine } from "@/lib/pos/cart";
import { modifierAppliesToProduct } from "@/lib/pos/modifiers";
import { newOrderId } from "@/lib/pos/order-id";
import { isDiscountKind, priceSale } from "@/lib/pos/pricing";
import type {
  BoxContent,
  OrderItem,
  SelectedModifier,
} from "@/types/database.types";
import { TAX_SETTINGS_OFF } from "@/lib/pos/tax";
import { nextLocalTicketNumber } from "@/lib/pos/ticket-counter";

import { readCachedMenu } from "./menu-cache";
import {
  findLocalByOrderId,
  listLocalOrders,
  saveLocalOrder,
} from "./order-store";
import {
  loadFailed,
  loaded,
  type DataSource,
  type MenuSnapshot,
} from "./types";

// the offline source: everything comes off this tablet.
//
// it only says yes to what it can actually do. a read it cannot answer fails
// with a plain sentence instead of stale data, because a kitchen acting on an
// old ticket is worse than a kitchen that knows it is blind.
export function createLocalSource(): DataSource {
  return {
    kind: "local",

    async loadMenu() {
      const cached = readCachedMenu();

      return cached
        ? loaded<MenuSnapshot>(cached)
        : loadFailed<MenuSnapshot>(
            "no internet, and this tablet has no saved menu yet. connect once, then it works offline.",
          );
    },

    async loadKitchenOrders() {
      return loadFailed<KitchenOrder[]>(
        "no internet. the board is showing the tickets it already had.",
      );
    },

    async loadKitchenOrder(orderId) {
      return loaded(findLocalByOrderId(orderId)?.order ?? null);
    },

    // the one read this source can honestly answer. the sales taken on this
    // tablet are right here, so the cashier can still look one up and print it
    // again with no internet - it just cannot show the ones taken before the
    // connection dropped, which the panel says out loud.
    async loadRecentOrders(sinceIso) {
      const since = Date.parse(sinceIso);

      return loaded(
        listLocalOrders()
          .map((local) => local.order)
          .filter(
            (order) =>
              Number.isNaN(since) || Date.parse(order.created_at) >= since,
          )
          .reverse(),
      );
    },

    async submitOrder(input) {
      if (input.lines.length === 0) {
        return { ok: false, message: "cart is empty" };
      }

      for (const line of input.lines) {
        if (!Number.isInteger(line.quantity) || line.quantity < 1) {
          return { ok: false, message: "a cart line has an invalid quantity" };
        }
      }

      // card and instapay are settled on their own device next to the till,
      // not through this app, so an offline sale can still record either one.
      // the method is stored as chosen and uploaded with the rest of the sale.

      const isDiyafa = input.isDiyafa === true;
      const diyafaReason = (input.diyafaReason ?? "").trim();

      if (isDiyafa && !diyafaReason) {
        return {
          ok: false,
          message: "enter a reason for diyafa (hospitality)",
        };
      }

      const customerName = (input.customerName ?? "").trim() || null;

      if (input.paymentMethod === "agel" && !isDiyafa && !customerName) {
        return { ok: false, message: "agel needs a customer name" };
      }

      const menu = readCachedMenu();

      if (!menu) {
        return {
          ok: false,
          message: "no saved menu on this tablet, so prices cannot be checked.",
        };
      }

      const productById = new Map(
        menu.products.map((product) => [product.id, product]),
      );
      const modifierById = new Map(
        menu.modifiers.map((modifier) => [modifier.id, modifier]),
      );

      // prices come from the saved menu, run through the same functions the
      // server uses, so an offline receipt and an online one agree to the
      // piastre. the server prices it again from the db on upload anyway.
      const pricedLines: (PricedLine & {
        productId: string;
        productName: string;
        boxContents: BoxContent[];
        notes: string | null;
      })[] = [];

      for (const line of input.lines) {
        const product = productById.get(line.productId);

        if (!product) {
          return {
            ok: false,
            message: "an item in the cart is not in the saved menu.",
          };
        }

        const selectedModifiers: SelectedModifier[] = [];

        for (const modifierId of line.modifierIds) {
          const modifier = modifierById.get(modifierId);

          if (!modifier) {
            return {
              ok: false,
              message: "an extra in the cart is not in the saved menu.",
            };
          }

          // null is a shared extra. a non-null row is still product-only.
          if (!modifierAppliesToProduct(modifier, product.id)) {
            return {
              ok: false,
              message: `${modifier.name} does not belong to ${product.name}`,
            };
          }

          selectedModifiers.push({
            id: modifier.id,
            name: modifier.name,
            extra_price: Number(modifier.extra_price),
          });
        }

        let boxContents: BoxContent[] = [];

        if (isBoxProduct(product)) {
          const allowed = new Set(
            menu.products
              .filter(
                (candidate) =>
                  candidate.category_id === product.contents_category_id &&
                  candidate.is_available &&
                  !isBoxProduct(candidate),
              )
              .map((candidate) => candidate.id),
          );

          const rebuilt: BoxContent[] = [];
          for (const piece of line.boxContents ?? []) {
            const flavor = productById.get(piece.id);
            if (!flavor) {
              return {
                ok: false,
                message: "a flavor in the box is not in the saved menu.",
              };
            }
            rebuilt.push({
              id: flavor.id,
              name: flavor.name,
              quantity: piece.quantity,
            });
          }

          const boxError = validateBoxContents({
            pieceCount: product.piece_count!,
            contentsCategoryId: product.contents_category_id!,
            contents: rebuilt,
            allowedProductIds: allowed,
          });

          if (boxError) {
            return { ok: false, message: boxError };
          }

          boxContents = rebuilt;
        } else if ((line.boxContents ?? []).length > 0) {
          return { ok: false, message: `${product.name} is not a box` };
        }

        pricedLines.push({
          productId: product.id,
          productName: product.name,
          basePrice: Number(product.base_price),
          quantity: line.quantity,
          selectedModifiers,
          boxContents,
          notes: line.notes,
        });
      }

      // the till hands the rule down with the sale. no connection means no way
      // to ask app_settings, and a paper printed here without the tax on it
      // would not match the one the server prints when this uploads.
      const discount =
        !isDiyafa &&
        input.discountKind &&
        isDiscountKind(input.discountKind) &&
        Number(input.discountValue) > 0
          ? {
              kind: input.discountKind,
              value: Number(input.discountValue),
            }
          : null;

      const priced = priceSale({
        lineTotal: cartTotal(pricedLines),
        tax: input.taxSettings ?? TAX_SETTINGS_OFF,
        discount,
        isDiyafa,
      });
      const orderId = newOrderId();
      const takenAt = new Date().toISOString();
      const ticket = nextLocalTicketNumber(new Date(takenAt));

      const items: OrderItem[] = pricedLines.map((line) => ({
        id: newOrderId(),
        order_id: orderId,
        product_id: line.productId,
        // snapshot the name, same as the server does, so a later menu edit
        // cannot rewrite what this customer bought
        product_name: line.productName,
        quantity: line.quantity,
        unit_price: lineUnitPrice(line),
        selected_modifiers: line.selectedModifiers,
        box_contents: line.boxContents,
        notes: line.notes,
        created_at: takenAt,
      }));

      const order: KitchenOrder = {
        id: orderId,
        client_id: input.clientId,
        total_amount: priced.payable,
        subtotal_amount: priced.subtotal,
        tax_amount: priced.tax,
        tax_rate: priced.rate,
        tax_label: priced.tax > 0 ? priced.label : null,
        discount_kind: priced.discountKind,
        discount_value: priced.discountKind ? priced.discountValue : null,
        discount_amount: priced.discountAmount,
        is_diyafa: isDiyafa,
        diyafa_reason: isDiyafa ? diyafaReason : null,
        agel_settled_at: null,
        agel_settled_by: null,
        agel_settled_payment_method: null,
        payment_method: input.paymentMethod,
        order_type: input.orderType,
        status: input.kdsEnabled ? "pending" : "completed",
        notes: input.notes,
        // the server stamps the real user when this is uploaded
        created_by: null,
        // but the paper is printed now, so the name is carried from the till.
        // the upload overwrites it with the one on the session's profile.
        created_by_name: input.cashierName ?? null,
        // no shift on the tablet. the upload attaches the sale to whichever
        // drawer is open when it lands, which is the honest answer - a sale
        // taken with no internet has no shift of its own to belong to.
        shift_id: null,
        customer_name: customerName,
        customer_phone: (input.customerPhone ?? "").trim() || null,
        // stock is pulled by the server on upload, never here
        stock_deducted: false,
        ticket_date: ticket.date,
        ticket_number: ticket.number,
        created_at: takenAt,
        updated_at: takenAt,
        items,
      };

      try {
        const saved = saveLocalOrder(order);

        return {
          ok: true,
          orderId: saved.order.id,
          total: saved.order.total_amount,
          ticketDate: saved.order.ticket_date ?? ticket.date,
          ticketNumber: saved.order.ticket_number ?? ticket.number,
        };
      } catch {
        // out of room, or storage switched off. saying "sold" here would put
        // money in the drawer against an order that does not exist.
        return {
          ok: false,
          message: "could not save the sale on this tablet. do not take payment.",
        };
      }
    },

    // an edit voids a ticket that lives on the server. there is nothing on
    // this tablet to void, and a sale rung up as a "replacement" with no void
    // is just a second sale for the same customer.
    async replaceOrder() {
      return {
        ok: false as const,
        message:
          "no internet. cancel the old ticket on the kitchen screen and ring the new one.",
      };
    },

    async moveStatus() {
      return {
        ok: false,
        message: "no internet. this ticket cannot move until the connection is back.",
      };
    },
  };
}
