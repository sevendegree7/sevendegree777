"use server";

import { isKitchenStatus, ticketNumber } from "@/lib/kds/orders";
import { cartTotal, lineUnitPrice, type PricedLine } from "@/lib/pos/cart";
import { isValidOrderId } from "@/lib/pos/order-id";
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
  // the id this order should be given. the till leaves it out and lets
  // postgres choose. a sale taken offline sends the id the tablet already put
  // on the ticket, so the number the kitchen has been reading does not change
  // under them when the sale finally goes up.
  orderId?: string;
  // offline sales reserve the visible number they already showed. online
  // sales leave these out and postgres allocates the next Egypt-day number.
  ticketDate?: string;
  ticketNumber?: number;
  // used only by the local source. the server always reads the real setting.
  kdsEnabled?: boolean;
  orderType: OrderType;
  paymentMethod: PaymentMethod;
  notes: string | null;
  lines: CheckoutLine[];
};

export type CheckoutResult =
  | {
      ok: true;
      orderId: string;
      total: number;
      ticketDate: string;
      ticketNumber: number;
    }
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

  if (input.orderId !== undefined && !isValidOrderId(input.orderId)) {
    return { ok: false, message: "this sale has an invalid id" };
  }

  if (
    (input.ticketDate === undefined) !== (input.ticketNumber === undefined) ||
    (input.ticketNumber !== undefined &&
      (!Number.isInteger(input.ticketNumber) || input.ticketNumber < 1))
  ) {
    return { ok: false, message: "this sale has an invalid ticket number" };
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
    .select("role, is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (
    !profile ||
    !profile.is_active ||
    (profile.role !== "cashier" && profile.role !== "admin")
  ) {
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

  const { data: allocated, error: ticketError } = await supabase.rpc(
    "allocate_ticket_number",
    {
      p_ticket_date: input.ticketDate,
      p_requested_number: input.ticketNumber ?? null,
    },
  );

  if (ticketError || !allocated) {
    return {
      ok: false,
      message:
        "could not allocate a ticket number. run the launch migration and try again.",
    };
  }

  const ticketDate =
    input.ticketDate ??
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Africa/Cairo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());

  const { data: settings } = await supabase
    .from("app_settings")
    .select("kds_enabled")
    .eq("id", "global")
    .maybeSingle();

  const initialStatus = settings?.kds_enabled ? "pending" : "completed";

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .insert({
      // only an offline sale sends one. postgres fills it in otherwise.
      ...(input.orderId ? { id: input.orderId } : {}),
      client_id: input.clientId,
      total_amount: total,
      payment_method: input.paymentMethod,
      order_type: input.orderType,
      status: initialStatus,
      notes: input.notes,
      created_by: user.id,
      ticket_date: ticketDate,
      ticket_number: allocated,
    })
    .select("id, ticket_date, ticket_number")
    .single();

  if (orderError || !order) {
    // the same checkout submitted twice lands here instead of charging twice
    if (orderError?.code === UNIQUE_VIOLATION) {
      const { data: existing } = await supabase
        .from("orders")
        .select("id, total_amount, ticket_date, ticket_number")
        .eq("client_id", input.clientId)
        .maybeSingle();

      if (existing) {
        return {
          ok: true,
          orderId: existing.id,
          total: Number(existing.total_amount),
          ticketDate: existing.ticket_date ?? ticketDate,
          ticketNumber: existing.ticket_number ?? Number(allocated),
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
    .update({ status: initialStatus })
    .eq("id", order.id);

  // pull raw materials for this sale (idempotent in postgres)
  const { error: deductError } = await supabase.rpc("deduct_stock_for_order", {
    p_order_id: order.id,
  });

  if (deductError) {
    // sale still stands - stock can be fixed by admin. do not cancel the ticket.
    console.error("stock deduct failed", deductError.message);
  }

  return {
    ok: true,
    orderId: order.id,
    total,
    ticketDate: order.ticket_date ?? ticketDate,
    ticketNumber: order.ticket_number ?? Number(allocated),
  };
}

export type ReplaceOrderInput = CheckoutInput & {
  // the ticket being corrected. it is voided once the new one is safely in.
  replacesOrderId: string;
};

export type ReplaceOrderResult =
  | {
      ok: true;
      orderId: string;
      total: number;
      ticketDate: string;
      ticketNumber: number;
      // short handle of the ticket that was voided, for the new receipt
      replaced: string;
      // the new sale is real either way. this is the part that did not go to
      // plan, in words the cashier can act on.
      warning?: string;
    }
  | { ok: false; message: string };

// correcting a sale that was already rung up.
//
// there is no "edit an order" in the database and there should not be: the
// ingredients have already been pulled, the ticket is already on the kitchen
// screen, and the money is already counted. so an edit is two things - a new
// sale, and a void of the old one - and the only real decision is the order
// they happen in.
//
// the new sale goes first. if it fails, the customer still has the ticket they
// started with, which is a bad afternoon. the other way round, a void that
// works followed by a sale that fails leaves them with nothing at all, which
// is a lost customer and a lost order the kitchen has already started making.
export async function replaceOrder(
  input: ReplaceOrderInput,
): Promise<ReplaceOrderResult> {
  if (!isValidOrderId(input.replacesOrderId)) {
    return { ok: false, message: "that ticket has an invalid id" };
  }

  const supabase = await createClient();

  const { data: original, error: readError } = await supabase
    .from("orders")
    .select("id, status, ticket_number")
    .eq("id", input.replacesOrderId)
    .maybeSingle();

  if (readError) {
    return { ok: false, message: "could not read that order. try again." };
  }

  if (!original) {
    return { ok: false, message: "that order no longer exists" };
  }

  // a ticket that already left the board is not editable. completed means the
  // customer has the food, and cancelled means this was already done once -
  // editing either would put a second sale in the day's takings for one order.
  if (!isKitchenStatus(original.status) && original.status !== "completed") {
    return {
      ok: false,
      message: `that ticket is already ${original.status}, so it cannot be edited. ring a new sale instead.`,
    };
  }

  // same path a fresh sale takes: prices re-read from the db, role checked,
  // client_id deduped, stock pulled. nothing about an edit is trusted more
  // than a normal checkout.
  const created = await createOrder(input);

  if (!created.ok) {
    return created;
  }

  // now void the old one. matched against the statuses that are still on the
  // board rather than the one read above, because the kitchen may have moved
  // it while the new sale was being written - and a move along the board is no
  // reason to refuse the void.
  const { data: cancelled, error: cancelError } = await supabase
    .from("orders")
    .update({ status: "cancelled" })
    .eq("id", input.replacesOrderId)
    .in("status", ["pending", "preparing", "ready", "completed"])
    .select("status")
    .maybeSingle();

  if (cancelError || !cancelled) {
    // the kitchen finished it while this was in flight, so there are now two
    // live tickets for one customer. say so plainly - this is the one outcome
    // that needs a person.
    return {
      ok: true,
      orderId: created.orderId,
      total: created.total,
      ticketDate: created.ticketDate,
      ticketNumber: created.ticketNumber,
      replaced: ticketNumber(original),
      warning: `the new ticket is live, but #${ticketNumber(original)} was finished before it could be cancelled. void it from order history.`,
    };
  }

  // the old sale's ingredients go back on the shelf. the rpc refuses to run
  // twice - `stock_deducted` is cleared in the same transaction that adds the
  // stock back - so a retry cannot restock the truck for free.
  const { error: returnError } = await supabase.rpc("return_stock_for_order", {
    p_order_id: input.replacesOrderId,
  });

  if (returnError) {
    console.error("stock return failed", returnError.message);

    return {
      ok: true,
      orderId: created.orderId,
      total: created.total,
      ticketDate: created.ticketDate,
      ticketNumber: created.ticketNumber,
      replaced: ticketNumber(original),
      warning:
        "the old ticket was cancelled, but its ingredients did not go back. fix it in admin > inventory.",
    };
  }

  return {
    ok: true,
    orderId: created.orderId,
    total: created.total,
    ticketDate: created.ticketDate,
    ticketNumber: created.ticketNumber,
    replaced: ticketNumber(original),
  };
}

export type CancelOrderResult =
  | { ok: true; ticket: string; warning?: string }
  | { ok: false; message: string };

// cashier void from order history, including a completed sale discovered late.
// stock return is idempotent, so a retry cannot add the same pieces twice.
export async function cancelOrder(orderId: string): Promise<CancelOrderResult> {
  if (!isValidOrderId(orderId)) {
    return { ok: false, message: "that ticket has an invalid id" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, message: "session expired. sign in again." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (
    !profile ||
    !profile.is_active ||
    (profile.role !== "cashier" && profile.role !== "admin")
  ) {
    return { ok: false, message: "this account cannot cancel orders" };
  }

  const { data: order, error: readError } = await supabase
    .from("orders")
    .select("id, status, ticket_number")
    .eq("id", orderId)
    .maybeSingle();

  if (readError || !order) {
    return { ok: false, message: "could not find that order" };
  }

  const ticket = ticketNumber(order);
  if (order.status === "cancelled") return { ok: true, ticket };

  const { data: cancelled, error: cancelError } = await supabase
    .from("orders")
    .update({ status: "cancelled" })
    .eq("id", orderId)
    .neq("status", "cancelled")
    .select("id")
    .maybeSingle();

  if (cancelError || !cancelled) {
    return { ok: false, message: "the order changed. refresh and try again." };
  }

  const { data: returned, error: returnError } = await supabase.rpc(
    "return_stock_for_order",
    { p_order_id: orderId },
  );

  const payload = returned as { ok?: boolean; message?: string } | null;
  if (returnError || payload?.ok === false) {
    return {
      ok: true,
      ticket,
      warning:
        "order cancelled, but stock return failed. check admin inventory.",
    };
  }

  return { ok: true, ticket };
}
