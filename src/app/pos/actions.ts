"use server";

import { cartTotal, lineUnitPrice, type PricedLine } from "@/lib/pos/cart";
import { createClient } from "@/lib/supabase/server";
import type {
  OrderType,
  PaymentMethod,
  SelectedModifier,
} from "@/types/database.types";

// what the browser sends at checkout.
// ids only - every price is re-read from the db below so a tampered or stale
// cart can never decide what the customer is charged.
export type CheckoutLine = {
  productId: string;
  quantity: number;
  modifierIds: string[];
  notes: string | null;
};

export type CheckoutInput = {
  // one id per checkout attempt, unique in the db so a double tap cannot
  // create two orders. also what offline sync will dedupe on later.
  clientId: string;
  orderType: OrderType;
  paymentMethod: PaymentMethod;
  notes: string | null;
  lines: CheckoutLine[];
};

export type CheckoutResult =
  | { ok: true; orderId: string; total: number }
  | { ok: false; message: string };

// postgres unique_violation
const UNIQUE_VIOLATION = "23505";

// writes one order plus its lines. status starts at pending so kds picks it up.
export async function createOrder(
  input: CheckoutInput,
): Promise<CheckoutResult> {
  if (input.lines.length === 0) {
    return { ok: false, message: "cart is empty" };
  }

  for (const line of input.lines) {
    if (!Number.isInteger(line.quantity) || line.quantity < 1) {
      return { ok: false, message: "a cart line has an invalid quantity" };
    }
  }

  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { ok: false, message: "session expired. sign in again." };
  }

  // rls blocks this too, but a plain message beats a raw policy error
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || (profile.role !== "cashier" && profile.role !== "admin")) {
    return { ok: false, message: "this account cannot take orders" };
  }

  // authoritative menu prices
  const productIds = [...new Set(input.lines.map((line) => line.productId))];
  const { data: products, error: productsError } = await supabase
    .from("products")
    .select("id, name, base_price, is_available")
    .in("id", productIds);

  if (productsError || !products) {
    return { ok: false, message: "could not load menu prices. try again." };
  }

  const productById = new Map(products.map((product) => [product.id, product]));

  const modifierIds = [
    ...new Set(input.lines.flatMap((line) => line.modifierIds)),
  ];
  const modifierById = new Map<
    string,
    { id: string; product_id: string; name: string; extra_price: number }
  >();

  if (modifierIds.length > 0) {
    const { data: modifiers, error: modifiersError } = await supabase
      .from("modifiers")
      .select("id, product_id, name, extra_price")
      .in("id", modifierIds);

    if (modifiersError || !modifiers) {
      return { ok: false, message: "could not load modifier prices. try again." };
    }

    for (const modifier of modifiers) {
      modifierById.set(modifier.id, modifier);
    }
  }

  // rebuild every line from db values
  const pricedLines: (PricedLine & {
    productId: string;
    productName: string;
    notes: string | null;
  })[] = [];

  for (const line of input.lines) {
    const product = productById.get(line.productId);

    if (!product) {
      return { ok: false, message: "a product in the cart no longer exists" };
    }

    if (!product.is_available) {
      return { ok: false, message: `${product.name} is no longer available` };
    }

    const selectedModifiers: SelectedModifier[] = [];

    for (const modifierId of line.modifierIds) {
      const modifier = modifierById.get(modifierId);

      if (!modifier) {
        return { ok: false, message: "a modifier in the cart no longer exists" };
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

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .insert({
      client_id: input.clientId,
      total_amount: total,
      payment_method: input.paymentMethod,
      order_type: input.orderType,
      status: "pending",
      notes: input.notes,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (orderError || !order) {
    // the same checkout submitted twice lands here instead of charging twice
    if (orderError?.code === UNIQUE_VIOLATION) {
      const { data: existing } = await supabase
        .from("orders")
        .select("id, total_amount")
        .eq("client_id", input.clientId)
        .maybeSingle();

      if (existing) {
        return {
          ok: true,
          orderId: existing.id,
          total: Number(existing.total_amount),
        };
      }
    }

    return { ok: false, message: "could not save the order. try again." };
  }

  const { error: itemsError } = await supabase.from("order_items").insert(
    pricedLines.map((line) => ({
      order_id: order.id,
      product_id: line.productId,
      // snapshot the name so later menu edits cannot rewrite old receipts
      product_name: line.productName,
      quantity: line.quantity,
      unit_price: lineUnitPrice(line),
      selected_modifiers: line.selectedModifiers,
      notes: line.notes,
    })),
  );

  if (itemsError) {
    // rls has no delete policy, so cancel the empty order rather than leave
    // a live pending ticket the kitchen would try to make
    await supabase
      .from("orders")
      .update({ status: "cancelled" })
      .eq("id", order.id);

    return {
      ok: false,
      message: "could not save the order lines. the order was cancelled.",
    };
  }

  // touch the order so kds gets a realtime event now that the lines exist.
  // the insert event above fires before order_items are written.
  await supabase
    .from("orders")
    .update({ status: "pending" })
    .eq("id", order.id);

  // pull raw materials for this sale (idempotent in postgres)
  const { error: deductError } = await supabase.rpc("deduct_stock_for_order", {
    p_order_id: order.id,
  });

  if (deductError) {
    // sale still stands - stock can be fixed by admin. do not cancel the ticket.
    console.error("stock deduct failed", deductError.message);
  }

  return { ok: true, orderId: order.id, total };
}
