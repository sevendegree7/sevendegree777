import Link from "next/link";

import { AdminShell } from "@/components/admin-shell";
import { formatMoney } from "@/lib/pos/money";
import { formatTruckTime } from "@/lib/pos/receipt";
import {
  buildReportSummary,
  periodDays,
} from "@/lib/reports/analytics";
import {
  startOfTruckDayIso,
  truckDateRange,
  truckDayKey,
} from "@/lib/reports/dates";
import { createClient } from "@/lib/supabase/server";

import { HourBars, HorizontalBars, VerticalBars } from "./charts";
import { PrintReportButton } from "./print-button";

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<{
    cashier?: string;
    period?: string;
    from?: string;
    to?: string;
  }>;
}) {
  const params = await searchParams;
  const selectedCashier = params.cashier ?? "";
  // an explicit range wins over the chips. a junk or half-filled one is simply
  // ignored, so a mistyped date shows the usual 30 days rather than nothing.
  const range = truckDateRange(params.from, params.to);
  const period = range
    ? "custom"
    : ["today", "7", "30", "90"].includes(params.period ?? "")
      ? (params.period as string)
      : "30";
  const since = range ? range.since : startOfTruckDayIso(periodDays(period));
  const today = truckDayKey(new Date());

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

  // only a custom range has a far end. the chips all run up to now.
  if (range) {
    ordersQuery = ordersQuery.lt("created_at", range.until);
    cancelledQuery = cancelledQuery.lt("created_at", range.until);
  }

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
    // everyone who can ring a sale, not just the `cashier` role. the owner
    // takes orders too, and filtering this list to cashiers left their tickets
    // falling back to the generic "Cashier" label in `analytics.ts` - so two
    // different people read as one person in the takings.
    supabase
      .from("profiles")
      .select("id, name, is_active")
      .in("role", ["cashier", "admin"])
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

  const periodLabel = range
    ? range.from === range.to
      ? range.from
      : `${range.from} → ${range.to}`
    : period === "today"
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
      <p className="print-hide mb-4 max-w-2xl text-sm text-muted">
        Sales for the truck day in Cairo time. Cancelled tickets stay out of
        revenue and show as their own count. Pick a chip for a quick look, or
        set both dates for an exact range — both days are included.
      </p>

      <div className="print-hide mb-4 flex flex-wrap gap-2">
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

      {/* one form for the range and the cashier, so the owner picks both and
          presses once. leaving the two dates empty falls back to the chip
          above, which is why they carry no default. */}
      <form className="print-hide mb-6 grid max-w-3xl gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
        <input type="hidden" name="period" value={range ? "30" : period} />
        <label className="text-sm">
          From
          <input
            type="date"
            name="from"
            defaultValue={range?.from ?? ""}
            max={today}
            className="mt-1 w-full rounded-xl border border-line bg-raised px-3 py-3"
          />
        </label>
        <label className="text-sm">
          To
          <input
            type="date"
            name="to"
            defaultValue={range?.to ?? ""}
            max={today}
            className="mt-1 w-full rounded-xl border border-line bg-raised px-3 py-3"
          />
        </label>
        <label className="text-sm">
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
        <div className="flex gap-3">
          <button
            type="submit"
            className="min-h-12 flex-1 rounded-xl bg-navy px-5 py-3 text-sm font-semibold text-cream dark:bg-accent-surface dark:text-accent-ink"
          >
            Filter
          </button>
          <PrintReportButton label="Print" />
        </div>
      </form>

      {error ? (
        <p className="text-danger">{error.message}</p>
      ) : (
        <div className="report-paper space-y-6">
          {/* only on paper. a printed sheet has none of the context the screen
              has - no nav saying which truck, no chips saying which days - so
              it carries its own heading or it is a page of loose numbers. */}
          <div className="hidden print:block">
            <p className="font-display text-xl font-semibold">
              Seven Degrees — Sales report
            </p>
            <p className="mt-1 text-sm">
              {periodLabel}
              {selectedCashier
                ? ` · ${cashierNames[selectedCashier] ?? "one cashier"}`
                : " · all cashiers"}
            </p>
            <p className="text-sm">
              Generated {formatTruckTime(new Date().toISOString())} (Cairo)
            </p>
            <hr className="mt-3 border-black/30" />
          </div>

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
