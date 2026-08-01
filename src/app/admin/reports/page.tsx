import { AdminShell } from "@/components/admin-shell";
import { formatMoney } from "@/lib/pos/money";
import { createClient } from "@/lib/supabase/server";

function daysAgoIso(days: number) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - days);
  return date.toISOString();
}

export default async function AdminReportsPage() {
  const supabase = await createClient();
  const since = daysAgoIso(30);

  const { data: orders, error } = await supabase
    .from("orders")
    .select("id, total_amount, payment_method, order_type, status, created_at")
    .gte("created_at", since)
    .neq("status", "cancelled")
    .order("created_at", { ascending: false });

  const list = orders ?? [];

  const total = list.reduce((sum, order) => sum + Number(order.total_amount), 0);

  const byPayment: Record<string, number> = {};
  const byType: Record<string, number> = {};
  const byDay: Record<string, number> = {};

  for (const order of list) {
    const pay = order.payment_method ?? "unknown";
    const type = order.order_type;
    const day = order.created_at.slice(0, 10);

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
    <AdminShell title="reports">
      <p className="mb-4 max-w-2xl text-sm text-stone-600">
        last 30 days, cancelled orders excluded. freebies at 0 price still
        appear in item counts if they were sold as order lines.
      </p>

      {error ? (
        <p className="text-red-700">{error.message}</p>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl bg-white p-5 shadow-sm">
              <p className="text-sm text-stone-500">total sales</p>
              <p className="mt-2 text-2xl font-semibold">{formatMoney(total)}</p>
              <p className="mt-1 text-sm text-stone-500">{list.length} orders</p>
            </div>
            <div className="rounded-2xl bg-white p-5 shadow-sm">
              <p className="text-sm text-stone-500">by payment</p>
              <ul className="mt-3 space-y-1 text-sm">
                {Object.entries(byPayment).map(([key, value]) => (
                  <li key={key}>
                    {key} · {formatMoney(value)}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl bg-white p-5 shadow-sm">
              <p className="text-sm text-stone-500">by order type</p>
              <ul className="mt-3 space-y-1 text-sm">
                {Object.entries(byType).map(([key, value]) => (
                  <li key={key}>
                    {key} · {formatMoney(value)}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <h2 className="text-lg font-medium">top items</h2>
            {topItems.length === 0 ? (
              <p className="mt-2 text-sm text-stone-500">no lines yet</p>
            ) : (
              <ul className="mt-3 divide-y divide-stone-100 text-sm">
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

          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <h2 className="text-lg font-medium">sales by day</h2>
            {dayRows.length === 0 ? (
              <p className="mt-2 text-sm text-stone-500">no days yet</p>
            ) : (
              <ul className="mt-3 divide-y divide-stone-100 text-sm">
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
