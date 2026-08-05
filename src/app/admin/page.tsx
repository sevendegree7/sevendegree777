import Link from "next/link";

import { AdminShell } from "@/components/admin-shell";
import { formatMoney } from "@/lib/pos/money";
import { startOfTruckDayIso } from "@/lib/reports/dates";
import { createClient } from "@/lib/supabase/server";

// admin home: today's sales + low stock + shortcuts
export default async function AdminPage() {
  const supabase = await createClient();
  // "today" is the truck's day, not the server's - vercel runs in utc
  const since = startOfTruckDayIso();

  const [
    ordersResult,
    inventoryResult,
    settingsResult,
    productsResult,
    productStockResult,
  ] = await Promise.all([
    supabase
      .from("orders")
      .select("id, total_amount, payment_method, status, created_at")
      .gte("created_at", since)
      .neq("status", "cancelled"),
    supabase
      .from("inventory_items")
      .select("id, name, unit, current_stock, min_threshold")
      .order("name"),
    supabase
      .from("app_settings")
      .select("inventory_mode")
      .eq("id", "global")
      .maybeSingle(),
    supabase.from("products").select("id, name"),
    supabase.from("product_stock").select("*"),
  ]);

  const orders = ordersResult.data ?? [];
  const finishedGoods =
    (settingsResult.data?.inventory_mode ?? "finished_goods") ===
    "finished_goods";
  const productName = new Map(
    (productsResult.data ?? []).map((product) => [product.id, product.name]),
  );
  const inventory = finishedGoods
    ? (productStockResult.data ?? []).map((item) => ({
        id: item.product_id,
        name: productName.get(item.product_id) ?? "unknown product",
        unit: "pcs",
        current_stock: item.current_stock,
        min_threshold: item.min_threshold,
      }))
    : (inventoryResult.data ?? []);

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
    (finishedGoods ? productStockResult.error : inventoryResult.error)?.message?.includes(
      "does not exist",
    ) ||
    (finishedGoods ? productStockResult.error : inventoryResult.error)?.code ===
      "42P01";

  return (
    <AdminShell title="Admin dashboard">
      {schemaMissing ? (
        <div className="rounded-2xl border border-warn bg-warn/10 p-6">
          <h2 className="text-lg font-medium text-amber-950">
            phase 3 sql not run yet
          </h2>
          <p className="mt-2 text-sm text-warn">
            open supabase sql editor and run{" "}
            <code className="rounded bg-warn/15 px-1">supabase/phase3.sql</code>{" "}
            then{" "}
            <code className="rounded bg-warn/15 px-1">
              supabase/phase3-seed.sql
            </code>
            . after that refresh this page.
          </p>
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl bg-raised p-5 shadow-sm">
          <p className="text-sm text-muted">Sales today</p>
          <p className="mt-2 text-3xl font-semibold">{formatMoney(salesTotal)}</p>
          <p className="mt-1 text-sm text-muted">{orders.length} orders</p>
        </div>
        <div className="rounded-2xl bg-raised p-5 shadow-sm">
          <p className="text-sm text-muted">By payment today</p>
          <ul className="mt-3 space-y-1 text-sm">
            <li>cash · {formatMoney(byPayment.cash)}</li>
            <li>card · {formatMoney(byPayment.card)}</li>
            <li>instapay · {formatMoney(byPayment.instapay)}</li>
          </ul>
        </div>
        <div className="rounded-2xl bg-raised p-5 shadow-sm">
          <p className="text-sm text-muted">Low stock</p>
          <p className="mt-2 text-3xl font-semibold">{lowStock.length}</p>
          <Link
            href="/admin/inventory"
            className="mt-2 inline-block text-sm text-muted underline"
          >
            open inventory
          </Link>
        </div>
      </div>

      {lowStock.length > 0 ? (
        <div className="mt-6 rounded-2xl bg-raised p-5 shadow-sm">
          <h2 className="text-lg font-medium">Needs restock</h2>
          <ul className="mt-3 divide-y divide-line">
            {lowStock.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between py-3 text-sm"
              >
                <span>{item.name}</span>
                <span className="text-danger">
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
