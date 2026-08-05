"use client";

import type { KitchenOrder } from "@/lib/kds/orders";
import { cartTotal, lineUnitPrice, type PricedLine } from "@/lib/pos/cart";
import type { OrderItem, SelectedModifier } from "@/types/database.types";
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

      // the ui blocks these already. this is the second lock: a card sale
      // saved on the tablet is a sale nobody ever collected the money for.
      if (input.paymentMethod !== "cash") {
        return {
          ok: false,
          message: `${input.paymentMethod} needs internet. take cash instead.`,
        };
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

          // a modifier only ever belongs to its own product
          if (modifier.product_id !== product.id) {
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

        pricedLines.push({
          productId: product.id,
          productName: product.name,
          basePrice: Number(product.base_price),
          quantity: line.quantity,
          selectedModifiers,
          notes: line.notes,
        });
      }

      const total = cartTotal(pricedLines);
      const orderId = crypto.randomUUID();
      const takenAt = new Date().toISOString();
      const ticket = nextLocalTicketNumber(new Date(takenAt));

      const items: OrderItem[] = pricedLines.map((line) => ({
        id: crypto.randomUUID(),
        order_id: orderId,
        product_id: line.productId,
        // snapshot the name, same as the server does, so a later menu edit
        // cannot rewrite what this customer bought
        product_name: line.productName,
        quantity: line.quantity,
        unit_price: lineUnitPrice(line),
        selected_modifiers: line.selectedModifiers,
        notes: line.notes,
        created_at: takenAt,
      }));

      const order: KitchenOrder = {
        id: orderId,
        client_id: input.clientId,
        total_amount: total,
        payment_method: input.paymentMethod,
        order_type: input.orderType,
        status: input.kdsEnabled ? "pending" : "completed",
        notes: input.notes,
        // the server stamps the real user when this is uploaded
        created_by: null,
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
