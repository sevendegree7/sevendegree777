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
  lines: ReceiptLine[];
  itemCount: number;
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

export function buildReceipt(
  order: KitchenOrder,
  options: { replaces?: string | null } = {},
): Receipt {
  const lines: ReceiptLine[] = order.items.map((item) => ({
    name: item.product_name,
    extras: item.selected_modifiers.map((modifier) => modifier.name),
    quantity: item.quantity,
    unitPrice: Number(item.unit_price),
    lineTotal: receiptLineTotal(Number(item.unit_price), item.quantity),
    notes: item.notes,
  }));

  return {
    ticket: order.id.slice(0, 8),
    takenAt: formatTruckTime(order.created_at),
    orderType: order.order_type,
    paymentMethod: order.payment_method,
    lines,
    itemCount: lines.reduce((sum, line) => sum + line.quantity, 0),
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
