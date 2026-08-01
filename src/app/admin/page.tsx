import Link from "next/link";

import { AdminShell } from "@/components/admin-shell";
import { formatMoney } from "@/lib/pos/money";
import { createClient } from "@/lib/supabase/server";

function startOfTodayIso() {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now.toISOString();
}

// admin home: today's sales + low stock + shortcuts
export default async function AdminPage() {
  const supabase = await createClient();
  const since = startOfTodayIso();

  const [ordersResult, inventoryResult] = await Promise.all([
    supabase
      .from("orders")
      .select("id, total_amount, payment_method, status, created_at")
      .gte("created_at", since)
      .neq("status", "cancelled"),
    supabase
      .from("inventory_items")
      .select("id, name, unit, current_stock, min_threshold")
      .order("name"),
  ]);

  const orders = ordersResult.data ?? [];
  const inventory = inventoryResult.data ?? [];

  const salesTotal = orders.reduce(
    (sum, order) => sum + Number(order.total_amount),
    0,
  );

  const byPayment = {
    cash: 0,
    card: 0,
    instapay: 0,
  };

  for (const order of orders) {
    const method = order.payment_method;
    if (method === "cash" || method === "card" || method === "instapay") {
      byPayment[method] += Number(order.total_amount);
    }
  }

  const lowStock = inventory.filter(
    (item) => Number(item.current_stock) <= Number(item.min_threshold),
  );

  const schemaMissing =
    inventoryResult.error?.message?.includes("does not exist") ||
    inventoryResult.error?.code === "42P01";

  return (
    <AdminShell title="admin dashboard">
      {schemaMissing ? (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-6">
          <h2 className="text-lg font-medium text-amber-950">
            phase 3 sql not run yet
          </h2>
          <p className="mt-2 text-sm text-amber-900">
            open supabase sql editor and run{" "}
            <code className="rounded bg-amber-100 px-1">supabase/phase3.sql</code>{" "}
            then{" "}
            <code className="rounded bg-amber-100 px-1">
              supabase/phase3-seed.sql
            </code>
            . after that refresh this page.
          </p>
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <p className="text-sm text-stone-500">sales today</p>
          <p className="mt-2 text-3xl font-semibold">{formatMoney(salesTotal)}</p>
          <p className="mt-1 text-sm text-stone-500">{orders.length} orders</p>
        </div>
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <p className="text-sm text-stone-500">by payment today</p>
          <ul className="mt-3 space-y-1 text-sm">
            <li>cash · {formatMoney(byPayment.cash)}</li>
            <li>card · {formatMoney(byPayment.card)}</li>
            <li>instapay · {formatMoney(byPayment.instapay)}</li>
          </ul>
        </div>
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <p className="text-sm text-stone-500">low stock</p>
          <p className="mt-2 text-3xl font-semibold">{lowStock.length}</p>
          <Link
            href="/admin/inventory"
            className="mt-2 inline-block text-sm text-stone-700 underline"
          >
            open inventory
          </Link>
        </div>
      </div>

      {lowStock.length > 0 ? (
        <div className="mt-6 rounded-2xl bg-white p-5 shadow-sm">
          <h2 className="text-lg font-medium">needs restock</h2>
          <ul className="mt-3 divide-y divide-stone-100">
            {lowStock.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between py-3 text-sm"
              >
                <span>{item.name}</span>
                <span className="text-red-700">
                  {Number(item.current_stock)} {item.unit} / min{" "}
                  {Number(item.min_threshold)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </AdminShell>
  );
}
