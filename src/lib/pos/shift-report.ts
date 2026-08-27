import { toPiastres, toPounds } from "@/lib/pos/money";

// what a shift adds up to when the drawer is counted back.
//
// the question this answers is the one asked at handover: the drawer should
// hold the float it started with plus every cash sale taken since. anything
// else is a difference someone has to explain, which is the entire reason the
// owner wanted shifts in the first place.
//
// card and instapay are reported but deliberately kept out of the expected
// cash - that money never went into the drawer.

export type ShiftOrder = {
  total_amount: number;
  payment_method: string | null;
  status: string;
  created_by_name?: string | null;
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

export type ShiftReport = {
  orderCount: number;
  cancelledCount: number;
  salesTotal: number;
  byPayment: ShiftPaymentRow[];
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

const PAYMENT_LABEL: Record<string, string> = {
  cash: "Cash",
  card: "Card",
  instapay: "InstaPay",
  agel: "Agel",
  unknown: "Unknown",
};

function addMoney(a: number, b: number): number {
  return toPounds(toPiastres(a) + toPiastres(b));
}

export function buildShiftReport(input: {
  orders: ShiftOrder[];
  openingFloat: number;
  countedCash: number | null;
}): ShiftReport {
  const live = input.orders.filter((order) => order.status !== "cancelled");
  const cancelledCount = input.orders.length - live.length;

  const paymentMap = new Map<string, { amount: number; count: number }>();
  const cashierMap = new Map<string, { amount: number; count: number }>();

  let salesTotal = 0;
  let cashSales = 0;

  for (const order of live) {
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

  const openingFloat = Number(input.openingFloat) || 0;
  const expectedCash = addMoney(openingFloat, cashSales);
  const countedCash =
    input.countedCash === null || input.countedCash === undefined
      ? null
      : Number(input.countedCash);

  return {
    orderCount: live.length,
    cancelledCount,
    salesTotal,
    byPayment: [...paymentMap.entries()]
      .map(([key, value]) => ({
        key,
        label: PAYMENT_LABEL[key] ?? key,
        amount: value.amount,
        count: value.count,
      }))
      .sort((a, b) => b.amount - a.amount),
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
