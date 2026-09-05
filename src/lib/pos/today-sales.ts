import { toPiastres, toPounds } from "./money";

// the till's live tickets since midnight on the truck clock.
//
// one tablet, so this is today's takings, not "who opened the shift". who
// rang each sale lives on the order as created_by_name, same as admin.

export type TodaySale = {
  total_amount: number;
  status: string;
  created_at: string;
};

export type TodaySales = {
  orderCount: number;
  salesTotal: number;
};

export const EMPTY_TODAY_SALES: TodaySales = {
  orderCount: 0,
  salesTotal: 0,
};

function addMoney(a: number, b: number): number {
  return toPounds(toPiastres(a) + toPiastres(b));
}

export function summariseTodaySales(orders: TodaySale[]): TodaySales {
  const live = orders.filter((order) => order.status !== "cancelled");

  let salesTotal = 0;
  for (const order of live) {
    salesTotal = addMoney(salesTotal, Number(order.total_amount));
  }

  return { orderCount: live.length, salesTotal };
}

export function mergeTodaySales(a: TodaySales, b: TodaySales): TodaySales {
  return {
    orderCount: a.orderCount + b.orderCount,
    salesTotal: addMoney(a.salesTotal, b.salesTotal),
  };
}

// keep only tickets that belong to this truck day. used so offline sales
// sitting on the tablet join today's number without pulling yesterday in.
export function salesOnTruckDay(
  orders: TodaySale[],
  sinceIso: string,
): TodaySale[] {
  const since = new Date(sinceIso).getTime();
  if (Number.isNaN(since)) return [];

  return orders.filter((order) => {
    const at = new Date(order.created_at).getTime();
    return !Number.isNaN(at) && at >= since;
  });
}
