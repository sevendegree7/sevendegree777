import { AdminShell } from "@/components/admin-shell";
import { formatMoney } from "@/lib/pos/money";
import { startOfTruckDayIso, truckDayKey } from "@/lib/reports/dates";
import { createClient } from "@/lib/supabase/server";

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ cashier?: string }>;
}) {
  const supabase = await createClient();
  const since = startOfTruckDayIso(30);
  const selectedCashier = (await searchParams).cashier ?? "";

  let ordersQuery = supabase
    .from("orders")
    .select(
      "id, total_amount, payment_method, order_type, status, created_at, created_by",
    )
    .gte("created_at", since)
    .neq("status", "cancelled")
    .order("created_at", { ascending: false });

  if (selectedCashier) {
    ordersQuery = ordersQuery.eq("created_by", selectedCashier);
  }

  const [{ data: orders, error }, { data: cashiers }] = await Promise.all([
    ordersQuery,
    supabase
      .from("profiles")
      .select("id, name, is_active")
      .eq("role", "cashier")
      .order("name"),
  ]);

  const list = orders ?? [];

  const total = list.reduce((sum, order) => sum + Number(order.total_amount), 0);

  const byPayment: Record<string, number> = {};
  const byType: Record<string, number> = {};
  const byDay: Record<string, number> = {};

  for (const order of list) {
    const pay = order.payment_method ?? "unknown";
    const type = order.order_type;
    // by the clock on the truck, so a 1am sale is not filed under yesterday
    const day = truckDayKey(order.created_at);

    byPayment[pay] = (byPayment[pay] ?? 0) + Number(order.total_amount);
    byType[type] = (byType[type] ?? 0) + Number(order.total_amount);
    byDay[day] = (byDay[day] ?? 0) + Number(order.total_amount);
  }

  // top items from recent order lines
  const orderIds = list.slice(0, 200).map((order) => order.id);
  const itemCounts: Record<string, { name: string; qty: number; revenue: number }> =
    {};

  if (orderIds.length > 0) {
    const { data: lines } = await supabase
      .from("order_items")
      .select("product_name, quantity, unit_price, order_id")
      .in("order_id", orderIds);

    for (const line of lines ?? []) {
      const key = line.product_name;
      const current = itemCounts[key] ?? {
        name: line.product_name,
        qty: 0,
        revenue: 0,
      };
      current.qty += line.quantity;
      current.revenue += Number(line.unit_price) * line.quantity;
      itemCounts[key] = current;
    }
  }

  const topItems = Object.values(itemCounts)
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 8);

  const dayRows = Object.entries(byDay).sort((a, b) => (a[0] < b[0] ? 1 : -1));

  return (
    <AdminShell title="Reports">
      <p className="mb-4 max-w-2xl text-sm text-muted">
        last 30 days, cancelled orders excluded. freebies at 0 price still
        appear in item counts if they were sold as order lines.
      </p>

      <form className="mb-5 flex max-w-md items-end gap-3" method="get">
        <label className="flex-1 text-sm">
          cashier
          <select
            name="cashier"
            defaultValue={selectedCashier}
            className="mt-1 w-full rounded-xl border border-line bg-raised px-3 py-2"
          >
            <option value="">all cashiers</option>
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
          className="rounded-xl bg-navy dark:bg-accent-surface dark:text-accent-ink px-4 py-2 text-cream"
        >
          filter
        </button>
      </form>

      {error ? (
        <p className="text-danger">{error.message}</p>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl bg-raised p-5 shadow-sm">
              <p className="text-sm text-muted">Total sales</p>
              <p className="mt-2 text-2xl font-semibold">{formatMoney(total)}</p>
              <p className="mt-1 text-sm text-muted">{list.length} orders</p>
            </div>
            <div className="rounded-2xl bg-raised p-5 shadow-sm">
              <p className="text-sm text-muted">By payment</p>
              <ul className="mt-3 space-y-1 text-sm">
                {Object.entries(byPayment).map(([key, value]) => (
                  <li key={key}>
                    {key} · {formatMoney(value)}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl bg-raised p-5 shadow-sm">
              <p className="text-sm text-muted">By order type</p>
              <ul className="mt-3 space-y-1 text-sm">
                {Object.entries(byType).map(([key, value]) => (
                  <li key={key}>
                    {key} · {formatMoney(value)}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="rounded-2xl bg-raised p-5 shadow-sm">
            <h2 className="text-lg font-medium">Top items</h2>
            {topItems.length === 0 ? (
              <p className="mt-2 text-sm text-muted">No lines yet</p>
            ) : (
              <ul className="mt-3 divide-y divide-line text-sm">
                {topItems.map((item) => (
                  <li
                    key={item.name}
                    className="flex justify-between gap-3 py-2"
                  >
                    <span>
                      {item.name} · qty {item.qty}
                    </span>
                    <span>{formatMoney(item.revenue)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-2xl bg-raised p-5 shadow-sm">
            <h2 className="text-lg font-medium">Sales by day</h2>
            {dayRows.length === 0 ? (
              <p className="mt-2 text-sm text-muted">No days yet</p>
            ) : (
              <ul className="mt-3 divide-y divide-line text-sm">
                {dayRows.map(([day, value]) => (
                  <li key={day} className="flex justify-between py-2">
                    <span>{day}</span>
                    <span>{formatMoney(value)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </AdminShell>
  );
}
