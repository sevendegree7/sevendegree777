import { toPiastres, toPounds } from "@/lib/pos/money";
import { truckDayKey, truckHour } from "@/lib/reports/dates";

export type ReportOrder = {
  id: string;
  total_amount: number;
  payment_method: string | null;
  order_type: string;
  status: string;
  created_at: string;
  created_by: string | null;
};

export type ReportLine = {
  product_name: string;
  quantity: number;
  unit_price: number;
  order_id: string;
};

export type NamedAmount = {
  key: string;
  label: string;
  amount: number;
  count?: number;
};

export type ReportSummary = {
  salesTotal: number;
  orderCount: number;
  averageTicket: number;
  cancelledCount: number;
  byPayment: NamedAmount[];
  byType: NamedAmount[];
  byDay: NamedAmount[];
  byHour: NamedAmount[];
  byCashier: NamedAmount[];
  topItems: { name: string; qty: number; revenue: number }[];
};

const PAYMENT_LABEL: Record<string, string> = {
  cash: "Cash",
  card: "Card",
  instapay: "InstaPay",
  unknown: "Unknown",
};

const TYPE_LABEL: Record<string, string> = {
  takeaway: "Takeaway",
  dine_in: "Dine in",
  talabat: "Talabat",
};

function moneySum(values: number[]): number {
  return toPounds(values.reduce((sum, value) => sum + toPiastres(value), 0));
}

export function buildReportSummary(input: {
  orders: ReportOrder[];
  cancelledCount: number;
  lines: ReportLine[];
  cashierNames: Record<string, string>;
}): ReportSummary {
  const live = input.orders.filter((order) => order.status !== "cancelled");
  const salesTotal = moneySum(live.map((order) => Number(order.total_amount)));
  const orderCount = live.length;
  const averageTicket =
    orderCount === 0 ? 0 : toPounds(toPiastres(salesTotal) / orderCount);

  const paymentMap = new Map<string, { amount: number; count: number }>();
  const typeMap = new Map<string, { amount: number; count: number }>();
  const dayMap = new Map<string, number>();
  const hourMap = new Map<number, { amount: number; count: number }>();
  const cashierMap = new Map<string, { amount: number; count: number }>();

  for (const order of live) {
    const amount = Number(order.total_amount);
    const pay = order.payment_method ?? "unknown";
    const type = order.order_type;
    const day = truckDayKey(order.created_at);
    const hour = truckHour(order.created_at);
    const cashier = order.created_by ?? "unknown";

    const payment = paymentMap.get(pay) ?? { amount: 0, count: 0 };
    payment.amount = toPounds(toPiastres(payment.amount) + toPiastres(amount));
    payment.count += 1;
    paymentMap.set(pay, payment);

    const typed = typeMap.get(type) ?? { amount: 0, count: 0 };
    typed.amount = toPounds(toPiastres(typed.amount) + toPiastres(amount));
    typed.count += 1;
    typeMap.set(type, typed);

    dayMap.set(
      day,
      toPounds(toPiastres(dayMap.get(day) ?? 0) + toPiastres(amount)),
    );

    const hourRow = hourMap.get(hour) ?? { amount: 0, count: 0 };
    hourRow.amount = toPounds(toPiastres(hourRow.amount) + toPiastres(amount));
    hourRow.count += 1;
    hourMap.set(hour, hourRow);

    const cashierRow = cashierMap.get(cashier) ?? { amount: 0, count: 0 };
    cashierRow.amount = toPounds(
      toPiastres(cashierRow.amount) + toPiastres(amount),
    );
    cashierRow.count += 1;
    cashierMap.set(cashier, cashierRow);
  }

  const itemCounts: Record<
    string,
    { name: string; qty: number; revenue: number }
  > = {};

  for (const line of input.lines) {
    const current = itemCounts[line.product_name] ?? {
      name: line.product_name,
      qty: 0,
      revenue: 0,
    };
    current.qty += line.quantity;
    current.revenue = toPounds(
      toPiastres(current.revenue) +
        toPiastres(Number(line.unit_price)) * line.quantity,
    );
    itemCounts[line.product_name] = current;
  }

  const byHour: NamedAmount[] = [];
  for (let hour = 0; hour < 24; hour += 1) {
    const row = hourMap.get(hour) ?? { amount: 0, count: 0 };
    byHour.push({
      key: String(hour),
      label: `${String(hour).padStart(2, "0")}:00`,
      amount: row.amount,
      count: row.count,
    });
  }

  return {
    salesTotal,
    orderCount,
    averageTicket,
    cancelledCount: input.cancelledCount,
    byPayment: [...paymentMap.entries()]
      .map(([key, value]) => ({
        key,
        label: PAYMENT_LABEL[key] ?? key,
        amount: value.amount,
        count: value.count,
      }))
      .sort((a, b) => b.amount - a.amount),
    byType: [...typeMap.entries()]
      .map(([key, value]) => ({
        key,
        label: TYPE_LABEL[key] ?? key,
        amount: value.amount,
        count: value.count,
      }))
      .sort((a, b) => b.amount - a.amount),
    byDay: [...dayMap.entries()]
      .map(([key, amount]) => ({ key, label: key, amount }))
      .sort((a, b) => (a.key < b.key ? -1 : 1)),
    byHour,
    byCashier: [...cashierMap.entries()]
      .map(([key, value]) => ({
        key,
        label:
          key === "unknown"
            ? "Unknown"
            : (input.cashierNames[key] ?? "Cashier"),
        amount: value.amount,
        count: value.count,
      }))
      .sort((a, b) => b.amount - a.amount),
    topItems: Object.values(itemCounts)
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 10),
  };
}

export function periodDays(period: string): number {
  if (period === "today") return 0;
  if (period === "7") return 6;
  if (period === "90") return 89;
  return 29;
}
