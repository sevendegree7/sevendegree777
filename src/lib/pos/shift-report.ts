import { toPiastres, toPounds } from "@/lib/pos/money";

// what a shift adds up to when the drawer is counted back.
//
// also the daily sales sheet the cashier prints at close: net, ticket count,
// average, category split, and cash/visa under revenue. cancels stay the
// existing cancelled status - no separate void bucket.

export type ShiftOrder = {
  id?: string;
  total_amount: number;
  payment_method: string | null;
  status: string;
  created_by_name?: string | null;
  is_diyafa?: boolean | null;
};

export type ShiftLine = {
  order_id: string;
  quantity: number;
  unit_price: number;
  category_id: string | null;
  category_name: string | null;
  category_sort?: number | null;
};

export type ShiftPaymentRow = {
  key: string;
  label: string;
  amount: number;
  count: number;
};

export type ShiftCashierRow = {
  name: string;
  amount: number;
  count: number;
};

export type ShiftCategoryRow = {
  key: string;
  label: string;
  amount: number;
  count: number;
};

export type ShiftReport = {
  // paid tickets only. the "net sales" line on the daily sheet.
  orderCount: number;
  averageTicket: number;
  cancelledCount: number;
  cancelledAmount: number;
  salesTotal: number;
  byPayment: ShiftPaymentRow[];
  byCategory: ShiftCategoryRow[];
  // the two cashiers may both have sold during one drawer session - a handover
  // where nobody closed the shift. the money is still one drawer, but the owner
  // needs to see whose sales are in it.
  byCashier: ShiftCashierRow[];
  cashSales: number;
  openingFloat: number;
  // what should be in the drawer right now
  expectedCash: number;
  // null while the shift is open, or closed without anyone counting
  countedCash: number | null;
  // counted minus expected. negative is short, positive is over. null when
  // there is nothing to compare against - which is not the same as zero.
  variance: number | null;
};

// Visa is what the handwritten daily sheet and the old till slip call card.
const PAYMENT_LABEL: Record<string, string> = {
  cash: "Cash",
  card: "Visa",
  instapay: "InstaPay",
  agel: "Agel",
  unknown: "Unknown",
};

function addMoney(a: number, b: number): number {
  return toPounds(toPiastres(a) + toPiastres(b));
}

function lineTotal(quantity: number, unitPrice: number): number {
  return toPounds(toPiastres(unitPrice) * quantity);
}

export function buildShiftReport(input: {
  orders: ShiftOrder[];
  lines?: ShiftLine[];
  openingFloat: number;
  countedCash: number | null;
}): ShiftReport {
  const live = input.orders.filter((order) => order.status !== "cancelled");
  const cancelled = input.orders.filter((order) => order.status === "cancelled");
  const cancelledCount = cancelled.length;
  const cancelledAmount = cancelled.reduce(
    (sum, order) => addMoney(sum, Number(order.total_amount)),
    0,
  );

  const paymentMap = new Map<string, { amount: number; count: number }>();
  const cashierMap = new Map<string, { amount: number; count: number }>();

  let salesTotal = 0;
  let cashSales = 0;

  const liveIds = new Set<string>();

  for (const order of live) {
    if (order.id) liveIds.add(order.id);

    const amount = Number(order.total_amount);
    salesTotal = addMoney(salesTotal, amount);

    const pay = order.payment_method ?? "unknown";
    if (pay === "cash") {
      cashSales = addMoney(cashSales, amount);
    }

    const payment = paymentMap.get(pay) ?? { amount: 0, count: 0 };
    payment.amount = addMoney(payment.amount, amount);
    payment.count += 1;
    paymentMap.set(pay, payment);

    // an order rung before created_by_name existed, or taken offline by a
    // tablet with nobody's name on it, still has to appear in the total
    const name = order.created_by_name?.trim() || "Unknown";
    const cashier = cashierMap.get(name) ?? { amount: 0, count: 0 };
    cashier.amount = addMoney(cashier.amount, amount);
    cashier.count += 1;
    cashierMap.set(name, cashier);
  }

  const diyafaIds = new Set(
    live.filter((order) => order.is_diyafa === true && order.id).map((o) => o.id!),
  );

  const categoryMap = new Map<
    string,
    { label: string; amount: number; count: number; sort: number }
  >();

  for (const line of input.lines ?? []) {
    // only lines on paid (non-cancelled) tickets. diyafa is free hospitality -
    // counting its menu prices as category sales would invent revenue.
    if (liveIds.size > 0 && !liveIds.has(line.order_id)) continue;
    if (diyafaIds.has(line.order_id)) continue;

    const key = line.category_id ?? "uncategorised";
    const label = line.category_name?.trim() || "Uncategorised";
    const amount = lineTotal(Number(line.quantity), Number(line.unit_price));
    const row = categoryMap.get(key) ?? {
      label,
      amount: 0,
      count: 0,
      sort: line.category_sort ?? 999,
    };
    row.amount = addMoney(row.amount, amount);
    row.count += Number(line.quantity) || 0;
    categoryMap.set(key, row);
  }

  const orderCount = live.length;
  const openingFloat = Number(input.openingFloat) || 0;
  const expectedCash = addMoney(openingFloat, cashSales);
  const countedCash =
    input.countedCash === null || input.countedCash === undefined
      ? null
      : Number(input.countedCash);

  return {
    orderCount,
    averageTicket:
      orderCount === 0 ? 0 : toPounds(toPiastres(salesTotal) / orderCount),
    cancelledCount,
    cancelledAmount,
    salesTotal,
    byPayment: [...paymentMap.entries()]
      .map(([key, value]) => ({
        key,
        label: PAYMENT_LABEL[key] ?? key,
        amount: value.amount,
        count: value.count,
      }))
      .sort((a, b) => b.amount - a.amount),
    byCategory: [...categoryMap.entries()]
      .map(([key, value]) => ({
        key,
        label: value.label,
        amount: value.amount,
        count: value.count,
      }))
      .sort((a, b) => {
        const sortA = categoryMap.get(a.key)?.sort ?? 999;
        const sortB = categoryMap.get(b.key)?.sort ?? 999;
        if (sortA !== sortB) return sortA - sortB;
        return b.amount - a.amount;
      }),
    byCashier: [...cashierMap.entries()]
      .map(([name, value]) => ({ name, amount: value.amount, count: value.count }))
      .sort((a, b) => b.amount - a.amount),
    cashSales,
    openingFloat,
    expectedCash,
    countedCash,
    variance:
      countedCash === null
        ? null
        : toPounds(toPiastres(countedCash) - toPiastres(expectedCash)),
  };
}
