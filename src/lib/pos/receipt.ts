import { TRUCK_TIMEZONE } from "@/lib/reports/dates";
import type { KitchenOrder } from "@/lib/kds/orders";
import type { OrderType, PaymentMethod } from "@/types/database.types";

import { toPiastres, toPounds } from "./money";

// what goes on a printed receipt, worked out from a stored order.
//
// this is deliberately a plain object and not jsx: the same receipt is printed
// from the till after a sale, re-printed later from the history, and printed
// again when an order is edited. one function decides what it says, and the
// component only decides how it looks.
//
// nothing here re-prices anything. `order_items.unit_price` is the price that
// was actually charged, snapshotted at checkout, so a menu edit next week
// cannot rewrite a receipt the customer already has in their hand.

export type ReceiptLine = {
  name: string;
  // modifier names, already priced into the unit price
  extras: string[];
  // dunkin pack flavors, shown under the box name
  boxContents: string[];
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  notes: string | null;
};

export type Receipt = {
  // the short handle the cashier and the kitchen both say out loud
  ticket: string;
  takenAt: string;
  orderType: OrderType;
  paymentMethod: PaymentMethod | null;
  // who rang it. printed so a complaint about this piece of paper can be put
  // to the right person instead of to whoever happens to be on shift.
  cashier: string | null;
  // the customer, when they gave their details. printed so a bag on the counter
  // can be called by name, and so a delivery has a number on the paper.
  customerName: string | null;
  customerPhone: string | null;
  lines: ReceiptLine[];
  itemCount: number;
  // the tax that was charged on this sale, read off the order rather than
  // recalculated. the rate the truck charges today has nothing to do with the
  // rate this customer paid, and the paper has to say what they paid.
  // null when there was no tax, which is every sale before the tax migration.
  tax: {
    label: string;
    rate: number;
    amount: number;
    subtotal: number;
  } | null;
  // discount taken after tax. null when none.
  discountAmount: number | null;
  // hospitality: whole ticket free
  isDiyafa: boolean;
  diyafaReason: string | null;
  // what the customer was charged. read off the order, not re-added from the
  // lines - this is the number the till and the db agree on.
  total: number;
  notes: string | null;
  // the ticket this one replaced, when the order was edited. printed so the
  // customer and the kitchen can both see which paper is the live one.
  replaces: string | null;
};

// the truck sells past midnight, so a receipt must show the clock on the wall
// rather than utc. same timezone the day-end report is cut on.
const TIME = new Intl.DateTimeFormat("en-GB", {
  timeZone: TRUCK_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function formatTruckTime(iso: string): string {
  const date = new Date(iso);

  // a receipt with no time beats a receipt that says "Invalid Date"
  return Number.isNaN(date.getTime()) ? "" : TIME.format(date);
}

// what one line costs in total. goes through piastres like every other price
// in the till, so a quantity of three cannot land a hundredth of a pound off.
export function receiptLineTotal(unitPrice: number, quantity: number): number {
  return toPounds(toPiastres(unitPrice) * quantity);
}

// the tax block, or nothing at all.
//
// nothing is the common case and the important one: a sale rung before tax
// existed, or rung while it was switched off, must print exactly the paper it
// always printed. a "TAX 0.00" line on a receipt is noise that invites a
// question nobody at the counter can answer.
function receiptTax(order: KitchenOrder): Receipt["tax"] {
  const amount = Number(order.tax_amount ?? 0);

  if (!Number.isFinite(amount) || amount <= 0) return null;

  const total = Number(order.total_amount);
  const subtotal = Number(order.subtotal_amount);

  return {
    label: order.tax_label?.trim() || "Tax",
    rate: Number(order.tax_rate ?? 0),
    amount,
    // fall back to arithmetic if the column never got filled in. the two agree
    // on every sale the till writes - this is only for a row edited by hand.
    subtotal: Number.isFinite(subtotal) ? subtotal : total - amount,
  };
}

export function buildReceipt(
  order: KitchenOrder,
  options: { replaces?: string | null } = {},
): Receipt {
  const lines: ReceiptLine[] = order.items.map((item) => ({
    name: item.product_name,
    extras: item.selected_modifiers.map((modifier) => modifier.name),
    boxContents: (item.box_contents ?? []).map(
      (piece) => `${piece.quantity}× ${piece.name}`,
    ),
    quantity: item.quantity,
    unitPrice: Number(item.unit_price),
    lineTotal: receiptLineTotal(Number(item.unit_price), item.quantity),
    notes: item.notes,
  }));

  return {
    ticket:
      typeof order.ticket_number === "number" &&
      Number.isInteger(order.ticket_number) &&
      order.ticket_number > 0
        ? String(order.ticket_number)
        : order.id.slice(0, 8),
    takenAt: formatTruckTime(order.created_at),
    orderType: order.order_type,
    paymentMethod: order.payment_method,
    // blank on sales taken before this column existed. an empty line is left
    // off the paper rather than printed as "Served by -".
    cashier: order.created_by_name?.trim() || null,
    customerName: order.customer_name?.trim() || null,
    customerPhone: order.customer_phone?.trim() || null,
    lines,
    itemCount: lines.reduce((sum, line) => sum + line.quantity, 0),
    tax: receiptTax(order),
    discountAmount:
      Number(order.discount_amount ?? 0) > 0
        ? Number(order.discount_amount)
        : null,
    isDiyafa: order.is_diyafa === true,
    diyafaReason: order.diyafa_reason?.trim() || null,
    total: Number(order.total_amount),
    notes: order.notes,
    replaces: options.replaces ?? null,
  };
}

// the lines added up. the till never charges from this - it is here so a
// receipt that does not add up to what was taken can be spotted.
export function receiptLinesTotal(receipt: Receipt): number {
  const piastres = receipt.lines.reduce(
    (sum, line) => sum + toPiastres(line.lineTotal),
    0,
  );

  return toPounds(piastres);
}
