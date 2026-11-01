"use server";

import { isKitchenStatus, ticketNumber } from "@/lib/kds/orders";
import { cartTotal, lineUnitPrice, type PricedLine } from "@/lib/pos/cart";
import { modifierAppliesToProduct } from "@/lib/pos/modifiers";
import { isValidOrderId } from "@/lib/pos/order-id";
import {
  formatTruckTime,
  receiptLineTotal,
  type Receipt,
} from "@/lib/pos/receipt";
import { createClient } from "@/lib/supabase/server";
import { readTaxSettings, type TaxSettings } from "@/lib/pos/tax";
import {
  isDiscountKind,
  priceSale,
  type DiscountInput,
} from "@/lib/pos/pricing";
import { truckDayKey } from "@/lib/reports/dates";
import type {
  BoxContent,
  DiscountKind,
  OrderType,
  PaymentMethod,
  SelectedModifier,
} from "@/types/database.types";
import { isBoxProduct, validateBoxContents } from "@/lib/pos/box";

// what the browser sends at checkout.
// ids only - every price is re-read from the db below so a tampered or stale
// cart can never decide what the customer is charged.
export type CheckoutLine = {
  productId: string;
  quantity: number;
  modifierIds: string[];
  // flavor ids and quantities for a dunkin-style box. empty for normal items
  boxContents: BoxContent[];
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
  // sales leave these out and postgres allocates the next number for the
  // open shift's start day (not "today" after midnight).
  ticketDate?: string;
  ticketNumber?: number;
  // drawer session this sale belongs to. offline stamps it when the sale is
  // taken; on upload the server keeps that shift even if it has since closed.
  shiftId?: string | null;
  // used only by the local source. the server always reads the real setting.
  kdsEnabled?: boolean;
  // also local-only: who is signed in at the till, so a sale rung with no
  // internet can print their name on the paper straight away. the server
  // never trusts this - it stamps the name off the session's own profile.
  cashierName?: string | null;
  // local-only as well. the offline source needs the tax rule to print a
  // correct paper with no connection. the server re-reads it from app_settings
  // and ignores whatever arrives here, because a cart that could name its own
  // tax rate is a cart that could set its own price.
  taxSettings?: TaxSettings | null;
  orderType: OrderType;
  paymentMethod: PaymentMethod;
  notes: string | null;
  // whatever the customer was willing to give. both optional - the queue moves
  // faster than a form does, and a required field here becomes a field full of
  // "-". stored so the truck can reach its own customers later.
  customerName?: string | null;
  customerPhone?: string | null;
  // discount after tax. server recomputes the amount from these + the lines.
  discountKind?: DiscountKind | null;
  discountValue?: number | null;
  // hospitality: whole ticket free. reason required when true.
  isDiyafa?: boolean;
  diyafaReason?: string | null;
  lines: CheckoutLine[];
};

// how long a name or a number is allowed to be. long enough for a real one,
// short enough that a leaning tablet cannot fill the column with one keypress.
const CUSTOMER_NAME_MAX = 80;
const CUSTOMER_PHONE_MAX = 32;
const DIYAF_REASON_MAX = 120;

function tidy(value: string | null | undefined, max: number): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function readDiscount(input: CheckoutInput): DiscountInput | null {
  if (!input.discountKind || !isDiscountKind(input.discountKind)) return null;
  const value = Number(input.discountValue);
  if (!Number.isFinite(value) || value <= 0) return null;
  return { kind: input.discountKind, value };
}

export type CheckoutResult =
  | {
      ok: true;
      orderId: string;
      total: number;
      ticketDate: string;
      ticketNumber: number;
      // authoritative receipt data avoids a second read after payment.
      receipt?: Receipt;
    }
  | { ok: false; message: string };

// postgres unique_violation
const UNIQUE_VIOLATION = "23505";

function receiptFromCheckout(input: {
  pricedLines: Array<{
    productName: string;
    basePrice: number;
    quantity: number;
    selectedModifiers: SelectedModifier[];
    boxContents: BoxContent[];
    notes: string | null;
  }>;
  ticket: number;
  createdAt: string;
  orderType: OrderType;
  paymentMethod: PaymentMethod;
  cashier: string;
  customerName: string | null;
  customerPhone: string | null;
  priced: ReturnType<typeof priceSale>;
  notes: string | null;
  isDiyafa: boolean;
  diyafaReason: string | null;
}): Receipt {
  return {
    ticket: String(input.ticket),
    takenAt: formatTruckTime(input.createdAt),
    orderType: input.orderType,
    paymentMethod: input.paymentMethod,
    cashier: input.cashier,
    customerName: input.customerName,
    customerPhone: input.customerPhone,
    lines: input.pricedLines.map((line) => ({
      name: line.productName,
      extras: line.selectedModifiers.map((modifier) => modifier.name),
      boxContents: line.boxContents.map(
        (piece) => `${piece.quantity}× ${piece.name}`,
      ),
      quantity: line.quantity,
      unitPrice: lineUnitPrice(line),
      lineTotal: receiptLineTotal(lineUnitPrice(line), line.quantity),
      notes: line.notes,
    })),
    itemCount: input.pricedLines.reduce(
      (sum, line) => sum + line.quantity,
      0,
    ),
    tax:
      input.priced.tax > 0
        ? {
            label: input.priced.label,
            rate: input.priced.rate,
            amount: input.priced.tax,
            subtotal: input.priced.subtotal,
          }
        : null,
    discountAmount: input.priced.discountAmount > 0
      ? input.priced.discountAmount
      : null,
    isDiyafa: input.isDiyafa,
    diyafaReason: input.diyafaReason,
    total: input.priced.payable,
    notes: input.notes,
    replaces: null,
  };
}

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

  const isDiyafa = input.isDiyafa === true;
  const diyafaReason = tidy(input.diyafaReason, DIYAF_REASON_MAX);

  if (isDiyafa && !diyafaReason) {
    return { ok: false, message: "enter a reason for diyafa (hospitality)" };
  }

  const customerName = tidy(input.customerName, CUSTOMER_NAME_MAX);
  const customerPhone = tidy(input.customerPhone, CUSTOMER_PHONE_MAX);

  if (input.paymentMethod === "agel" && !isDiyafa && !customerName) {
    return { ok: false, message: "agel needs a customer name" };
  }

  if (
    input.paymentMethod !== "cash" &&
    input.paymentMethod !== "card" &&
    input.paymentMethod !== "instapay" &&
    input.paymentMethod !== "agel"
  ) {
    return { ok: false, message: "pick a payment method" };
  }

  // ticketDate alone is allowed: the open shift's start day, so numbering
  // does not restart at midnight. ticketNumber without a date is not.
  if (
    input.ticketNumber !== undefined &&
    (input.ticketDate === undefined ||
      !Number.isInteger(input.ticketNumber) ||
      input.ticketNumber < 1)
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

  // rls blocks this too, but a plain message beats a raw policy error.
  // the name comes along for the ride: it is snapshotted onto the order so the
  // receipt can say who took the money without a join.
  const { data: profile } = await supabase
    .from("profiles")
    .select("name, role, is_active")
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
  const flavorIds = [
    ...new Set(
      input.lines.flatMap((line) =>
        (line.boxContents ?? []).map((piece) => piece.id),
      ),
    ),
  ];
  const { data: products, error: productsError } = await supabase
    .from("products")
    .select(
      "id, name, base_price, is_available, piece_count, contents_category_id, category_id",
    )
    .in("id", [...new Set([...productIds, ...flavorIds])]);

  if (productsError || !products) {
    return { ok: false, message: "could not load menu prices. try again." };
  }

  const productById = new Map(products.map((product) => [product.id, product]));

  const modifierIds = [
    ...new Set(input.lines.flatMap((line) => line.modifierIds)),
  ];
  const modifierById = new Map<
    string,
    { id: string; product_id: string | null; name: string; extra_price: number }
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
    boxContents: BoxContent[];
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
        products
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
          return { ok: false, message: "a flavor in the box no longer exists" };
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

  // the lines added up. what the customer actually pays depends on the tax
  // rule below, which is read from the server and never from the browser -
  // a cart that arrived claiming its own tax would be a cart that sets its
  // own price.
  const lineTotal = cartTotal(pricedLines);

  // drawer first, then ticket. ticket dates follow the open shift's start day
  // so a session that crosses midnight keeps one continuous sequence.
  const [{ data: settings }, { data: openShift }] = await Promise.all([
    supabase
      .from("app_settings")
      .select("*")
      .eq("id", "global")
      .maybeSingle(),
    supabase
      .from("shifts")
      .select("id, opened_at")
      .is("closed_at", null)
      .maybeSingle(),
  ]);

  // which drawer this sale belongs to.
  //
  // a missing shift never stops a sale. if nobody opened one - first sale of
  // the morning, or a cashier who went straight to the screen - one is opened
  // for them with a zero float, so the money is still attributed to somebody.
  // if even that fails the sale goes through unattached rather than not at all.
  //
  // offline uploads send the shift they were taken under. keep that even if
  // the drawer has since closed, so a late sync cannot move last night's
  // money onto this morning's shift.
  let shiftId: string | null = null;
  let shiftOpenedAt: string | null = null;
  {
    const preferredId = input.shiftId?.trim() || null;
    if (preferredId) {
      const { data: preferred } = await supabase
        .from("shifts")
        .select("id, opened_at")
        .eq("id", preferredId)
        .maybeSingle();
      if (preferred) {
        shiftId = preferred.id;
        shiftOpenedAt = preferred.opened_at;
      }
    }

    if (!shiftId && openShift) {
      shiftId = openShift.id;
      shiftOpenedAt = openShift.opened_at;
    }

    if (!shiftId) {
      const { data: started } = await supabase
        .from("shifts")
        .insert({ opened_by: user.id, opened_by_name: profile.name })
        .select("id, opened_at")
        .maybeSingle();

      if (started) {
        shiftId = started.id;
        shiftOpenedAt = started.opened_at;
      } else {
        // somebody else opened one in the moment between the read and the
        // insert. take theirs rather than leaving the sale unattached.
        const { data: raced } = await supabase
          .from("shifts")
          .select("id, opened_at")
          .is("closed_at", null)
          .maybeSingle();

        shiftId = raced?.id ?? null;
        shiftOpenedAt = raced?.opened_at ?? null;
      }
    }
  }

  const ticketDate =
    input.ticketDate ??
    (shiftOpenedAt
      ? truckDayKey(new Date(shiftOpenedAt))
      : truckDayKey(new Date()));

  const { data: allocated, error: ticketError } = await supabase.rpc(
    "allocate_ticket_number",
    {
      p_ticket_date: ticketDate,
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

  const initialStatus = settings?.kds_enabled ? "pending" : "completed";

  // the tax rule as it stands right now, then discount after tax, then diyafa
  // zeros the payable. from this point the numbers are history.
  const priced = priceSale({
    lineTotal,
    tax: readTaxSettings(settings),
    discount: isDiyafa ? null : readDiscount(input),
    isDiyafa,
  });
  const total = priced.payable;

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .insert({
      // only an offline sale sends one. postgres fills it in otherwise.
      ...(input.orderId ? { id: input.orderId } : {}),
      client_id: input.clientId,
      total_amount: total,
      subtotal_amount: priced.subtotal,
      tax_amount: priced.tax,
      tax_rate: priced.rate,
      // only worth keeping when something was charged. a label with no tax
      // behind it would print an empty line on the paper.
      tax_label: priced.tax > 0 ? priced.label : null,
      discount_kind: priced.discountKind,
      discount_value: priced.discountKind ? priced.discountValue : null,
      discount_amount: priced.discountAmount,
      is_diyafa: isDiyafa,
      diyafa_reason: isDiyafa ? diyafaReason : null,
      payment_method: input.paymentMethod,
      order_type: input.orderType,
      status: initialStatus,
      notes: input.notes,
      created_by: user.id,
      created_by_name: profile.name,
      shift_id: shiftId,
      customer_name: customerName,
      customer_phone: customerPhone,
      ticket_date: ticketDate,
      ticket_number: allocated,
    })
    .select("id, ticket_date, ticket_number, created_at")
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
      box_contents: line.boxContents,
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

  // The lines are already committed before these two independent operations.
  // Keep the realtime touch and stock deduction together so checkout does not
  // wait for another round trip after payment.
  const [{ error: statusError }, { error: deductError }] = await Promise.all([
    supabase
      .from("orders")
      .update({ status: initialStatus })
      .eq("id", order.id),
    supabase.rpc("deduct_stock_for_order", {
      p_order_id: order.id,
    }),
  ]);

  if (statusError) {
    console.error("order status update failed", statusError.message);
  }

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
    receipt: receiptFromCheckout({
      pricedLines,
      ticket: order.ticket_number ?? Number(allocated),
      createdAt: order.created_at,
      orderType: input.orderType,
      paymentMethod: input.paymentMethod,
      cashier: profile.name,
      customerName,
      customerPhone,
      priced,
      notes: input.notes,
      isDiyafa,
      diyafaReason,
    }),
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

  // an edit voids the old ticket, so it is a cancel wearing a different hat
  // and it answers to the same rule. checked before anything is written.
  const { denied } = await requireAdminForOrders(supabase, "edit an order");
  if (denied) return { ok: false, message: denied };

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

// undoing a sale is an admin's job, not a cashier's.
//
// once a ticket is rung the money is in the drawer, and the two operations
// that can take it back out - voiding a sale and editing one into a cheaper
// one - are exactly how a till gets skimmed. a cashier who can cancel their
// own sale can pocket the cash and leave a cancelled row that nobody queries.
//
// so both go through here, and the check is on the server. the buttons are
// hidden in the till as well, but that is a courtesy to the cashier, not the
// control - a hidden button is still a button somebody can call.
//
// it hands the admin's id back rather than a bare yes, because the operations
// that need this check are the same ones worth signing: hiding a ticket writes
// down who hid it, and asking auth a second time for a name we already looked
// up is a round trip for nothing.
type AdminCheck = { denied: string } | { denied: null; adminId: string };

async function requireAdminForOrders(
  supabase: Awaited<ReturnType<typeof createClient>>,
  action: string,
): Promise<AdminCheck> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { denied: "session expired. sign in again." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || !profile.is_active) {
    return { denied: "this account is not active" };
  }

  if (profile.role !== "admin") {
    // says who can, not just that you cannot. the cashier's next move is to
    // fetch the manager, and the message should tell them that.
    return {
      denied: `only an admin can ${action}. ask the manager to sign in.`,
    };
  }

  return { denied: null, adminId: user.id };
}

// admin void from order history, including a completed sale discovered late.
// stock return is idempotent, so a retry cannot add the same pieces twice.
export async function cancelOrder(orderId: string): Promise<CancelOrderResult> {
  if (!isValidOrderId(orderId)) {
    return { ok: false, message: "that ticket has an invalid id" };
  }

  const supabase = await createClient();

  const { denied } = await requireAdminForOrders(supabase, "cancel an order");
  if (denied) return { ok: false, message: denied };

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

export type HideOrderResult =
  | { ok: true; ticket: string }
  | { ok: false; message: string };

// taking a cancelled ticket off the order history, and putting it back.
//
// this is not a delete and must never become one. the sale stays in the table:
// out of the takings because it is cancelled, still in the cancelled count on
// the admin report, still answering "what happened to ticket 8" months later.
// what changes is one list on one screen.
//
// admin only, for the same reason cancelling is. a cashier who can cancel a
// sale and then make the cancellation disappear has been handed the whole
// skim in two taps.
export async function setOrderHidden(
  orderId: string,
  hidden: boolean,
): Promise<HideOrderResult> {
  if (!isValidOrderId(orderId)) {
    return { ok: false, message: "that ticket has an invalid id" };
  }

  const supabase = await createClient();

  const check = await requireAdminForOrders(
    supabase,
    hidden ? "hide an order" : "restore an order",
  );
  // `!== null` and not a truthiness check: an empty string is falsy, so only
  // the explicit compare narrows the union down to the branch carrying the id
  if (check.denied !== null) return { ok: false, message: check.denied };

  const { data: order, error: readError } = await supabase
    .from("orders")
    .select("id, status, ticket_number")
    .eq("id", orderId)
    .maybeSingle();

  if (readError || !order) {
    return { ok: false, message: "could not find that order" };
  }

  const ticket = ticketNumber(order);

  // the database refuses this too. saying it here is what turns a constraint
  // violation into a sentence the person at the till can act on.
  if (hidden && order.status !== "cancelled") {
    return {
      ok: false,
      message: `#${ticket} is still a live sale. cancel it first, then hide it.`,
    };
  }

  const { data: updated, error: updateError } = await supabase
    .from("orders")
    .update(
      hidden
        ? { hidden_at: new Date().toISOString(), hidden_by: check.adminId }
        : { hidden_at: null, hidden_by: null },
    )
    .eq("id", orderId)
    .select("id")
    .maybeSingle();

  // the error is passed through rather than flattened into "try again".
  // until the migration is run there is no hidden_at column, and postgres says
  // so exactly - swallowing that would turn a five minute fix into an evening
  // of pressing a button that quietly does nothing.
  if (updateError || !updated) {
    return {
      ok: false,
      message:
        updateError?.message ?? "the order changed. refresh and try again.",
    };
  }

  return { ok: true, ticket };
}
