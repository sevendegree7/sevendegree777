import { AdminShell } from "@/components/admin-shell";
import { createClient } from "@/lib/supabase/server";

import { WasteForm } from "./waste-form";
import { FinishedWasteForm } from "./finished-waste-form";

export default async function AdminWastePage() {
  const supabase = await createClient();

  const [
    settingsResult,
    itemsResult,
    logsResult,
    productsResult,
    productStockResult,
    productLogsResult,
  ] = await Promise.all([
    supabase
      .from("app_settings")
      .select("inventory_mode")
      .eq("id", "global")
      .maybeSingle(),
    supabase.from("inventory_items").select("*").order("name"),
    supabase
      .from("waste_logs")
      .select("id, quantity, reason, notes, created_at, inventory_item_id")
      .order("created_at", { ascending: false })
      .limit(20),
    supabase.from("products").select("*").order("name"),
    supabase.from("product_stock").select("*"),
    supabase
      .from("product_waste_logs")
      .select("id, quantity, reason, notes, created_at, product_id")
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const finishedGoods =
    (settingsResult.data?.inventory_mode ?? "finished_goods") ===
    "finished_goods";

  const nameById: Record<string, string> = {};
  for (const item of itemsResult.data ?? []) {
    nameById[item.id] = `${item.name} (${item.unit})`;
  }
  for (const product of productsResult.data ?? []) {
    nameById[product.id] = `${product.name} (pcs)`;
  }

  const activeLogs = finishedGoods
    ? (productLogsResult.data ?? []).map((log) => ({
        ...log,
        stock_id: log.product_id,
      }))
    : (logsResult.data ?? []).map((log) => ({
        ...log,
        stock_id: log.inventory_item_id,
      }));
  const activeError = finishedGoods
    ? productLogsResult.error
    : logsResult.error;

  return (
    <AdminShell title="Waste">
      <p className="mb-4 max-w-2xl text-sm text-muted">
        log burnt, dropped, or spoiled stock. this lowers inventory and does not
        count as sales revenue.
      </p>

      {finishedGoods ? (
        <FinishedWasteForm
          products={productsResult.data ?? []}
          stock={productStockResult.data ?? []}
        />
      ) : itemsResult.error ? (
        <p className="text-danger">{itemsResult.error.message}</p>
      ) : (
        <WasteForm items={itemsResult.data ?? []} />
      )}

      <div className="mt-8 rounded-2xl bg-raised p-5 shadow-sm">
        <h2 className="text-lg font-medium">Recent waste</h2>
        {activeError ? (
          <p className="mt-2 text-sm text-muted">{activeError.message}</p>
        ) : activeLogs.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No waste logs yet</p>
        ) : (
          <ul className="mt-3 divide-y divide-line text-sm">
            {activeLogs.map((log) => (
              <li key={log.id} className="flex justify-between gap-3 py-3">
                <span>
                  {nameById[log.stock_id] ?? "item"} · {log.reason} ·{" "}
                  {Number(log.quantity)}
                  {log.notes ? ` · ${log.notes}` : ""}
                </span>
                <span className="shrink-0 text-muted">
                  {new Date(log.created_at).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AdminShell>
  );
}
