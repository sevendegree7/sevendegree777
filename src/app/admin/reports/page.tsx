import Link from "next/link";

import { AdminShell } from "@/components/admin-shell";
import { formatMoney } from "@/lib/pos/money";
import {
  buildReportSummary,
  periodDays,
} from "@/lib/reports/analytics";
import { startOfTruckDayIso } from "@/lib/reports/dates";
import { createClient } from "@/lib/supabase/server";

import { HourBars, HorizontalBars, VerticalBars } from "./charts";

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ cashier?: string; period?: string }>;
}) {
  const params = await searchParams;
  const selectedCashier = params.cashier ?? "";
  const period = ["today", "7", "30", "90"].includes(params.period ?? "")
    ? (params.period as string)
    : "30";
  const daysAgo = periodDays(period);
  const since = startOfTruckDayIso(daysAgo);

  const supabase = await createClient();

  let ordersQuery = supabase
    .from("orders")
    .select(
      "id, total_amount, payment_method, order_type, status, created_at, created_by",
    )
    .gte("created_at", since)
    .neq("status", "cancelled")
    .order("created_at", { ascending: false });

  let cancelledQuery = supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .gte("created_at", since)
    .eq("status", "cancelled");

  if (selectedCashier) {
    ordersQuery = ordersQuery.eq("created_by", selectedCashier);
    cancelledQuery = cancelledQuery.eq("created_by", selectedCashier);
  }

  const [
    { data: orders, error },
    { count: cancelledCount },
    { data: cashiers },
  ] = await Promise.all([
    ordersQuery,
    cancelledQuery,
    supabase
      .from("profiles")
      .select("id, name, is_active")
      .eq("role", "cashier")
      .order("name"),
  ]);

  const list = orders ?? [];
  const orderIds = list.map((order) => order.id);

  const { data: lines } =
    orderIds.length > 0
      ? await supabase
          .from("order_items")
          .select("product_name, quantity, unit_price, order_id")
          .in("order_id", orderIds)
      : { data: [] };

  const cashierNames: Record<string, string> = {};
  for (const cashier of cashiers ?? []) {
    cashierNames[cashier.id] = cashier.name;
  }

  const summary = buildReportSummary({
    orders: list,
    cancelledCount: cancelledCount ?? 0,
    lines: lines ?? [],
    cashierNames,
  });

  const periodLabel =
    period === "today"
      ? "Today"
      : period === "7"
        ? "Last 7 days"
        : period === "90"
          ? "Last 90 days"
          : "Last 30 days";

  const periods = [
    { id: "today", label: "Today" },
    { id: "7", label: "7 days" },
    { id: "30", label: "30 days" },
    { id: "90", label: "90 days" },
  ] as const;

  return (
    <AdminShell title="Reports">
      <p className="mb-4 max-w-2xl text-sm text-muted">
        Sales for the truck day in Cairo time. Cancelled tickets stay out of
        revenue and show as their own count.
      </p>

      <div className="mb-4 flex flex-wrap gap-2">
        {periods.map((option) => {
          const href = `/admin/reports?period=${option.id}${
            selectedCashier ? `&cashier=${selectedCashier}` : ""
          }`;
          const active = period === option.id;

          return (
            <Link
              key={option.id}
              href={href}
              className={`rounded-xl px-4 py-2.5 text-sm font-medium ${
                active
                  ? "bg-navy text-cream dark:bg-accent-surface dark:text-accent-ink"
                  : "border border-line bg-raised text-muted"
              }`}
            >
              {option.label}
            </Link>
          );
        })}
      </div>

      <form className="mb-6 flex max-w-md flex-col gap-3 sm:flex-row sm:items-end">
        <input type="hidden" name="period" value={period} />
        <label className="flex-1 text-sm">
          Cashier
          <select
            name="cashier"
            defaultValue={selectedCashier}
            className="mt-1 w-full rounded-xl border border-line bg-raised px-3 py-3"
          >
            <option value="">All cashiers</option>
            {(cashiers ?? []).map((cashier) => (
              <option key={cashier.id} value={cashier.id}>
                {cashier.name}
                {cashier.is_active ? "" : " (disabled)"}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="min-h-12 rounded-xl bg-navy px-5 py-3 text-sm font-semibold text-cream dark:bg-accent-surface dark:text-accent-ink"
        >
          Filter
        </button>
      </form>

      {error ? (
        <p className="text-danger">{error.message}</p>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi
              label={`${periodLabel} sales`}
              value={formatMoney(summary.salesTotal)}
              hint={`${summary.orderCount} orders`}
            />
            <Kpi
              label="Average ticket"
              value={formatMoney(summary.averageTicket)}
              hint="Per completed order"
            />
            <Kpi
              label="Orders"
              value={String(summary.orderCount)}
              hint={`${summary.cancelledCount} cancelled`}
            />
            <Kpi
              label="Top seller"
              value={summary.topItems[0]?.name ?? "—"}
              hint={
                summary.topItems[0]
                  ? `${summary.topItems[0].qty} sold`
                  : "No lines yet"
              }
            />
          </div>

          <VerticalBars
            title="Sales by day"
            rows={summary.byDay}
            emptyText="No sales in this range yet"
          />

          <div className="grid gap-4 lg:grid-cols-2">
            <HorizontalBars
              title="Payment mix"
              rows={summary.byPayment}
              showCount
            />
            <HorizontalBars
              title="Order type"
              rows={summary.byType}
              showCount
            />
          </div>

          <HourBars title="Busy hours (Cairo)" rows={summary.byHour} />

          <div className="grid gap-4 lg:grid-cols-2">
            <HorizontalBars
              title="Cashiers"
              rows={summary.byCashier}
              showCount
              emptyText="No cashier sales in this range"
            />

            <section className="rounded-2xl border border-line bg-raised p-5">
              <h2 className="font-display text-lg font-semibold">Top items</h2>
              {summary.topItems.length === 0 ? (
                <p className="mt-3 text-sm text-muted">No lines yet</p>
              ) : (
                <ul className="mt-4 space-y-3">
                  {summary.topItems.map((item, index) => {
                    const max = summary.topItems[0]?.qty ?? 1;
                    const width = Math.round((item.qty / max) * 100);

                    return (
                      <li key={item.name}>
                        <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                          <span className="font-medium capitalize">
                            {index + 1}. {item.name}
                          </span>
                          <span className="font-mono text-muted">
                            {item.qty} · {formatMoney(item.revenue)}
                          </span>
                        </div>
                        <div className="h-2.5 overflow-hidden rounded-full bg-sunken">
                          <div
                            className="h-full rounded-full bg-navy dark:bg-accent-surface"
                            style={{ width: `${width}%` }}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>
        </div>
      )}
    </AdminShell>
  );
}

function Kpi({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-2xl border border-line bg-raised p-5">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-2 font-display text-2xl font-semibold capitalize leading-tight">
        {value}
      </p>
      <p className="mt-1 text-sm text-muted">{hint}</p>
    </div>
  );
}
