import { AdminShell } from "@/components/admin-shell";
import { createClient } from "@/lib/supabase/server";

import { InventoryPanel } from "./inventory-panel";
import { FinishedStockPanel } from "./finished-stock-panel";

export default async function AdminInventoryPage() {
  const supabase = await createClient();
  const [settingsResult, ingredientsResult, productsResult, stockResult] =
    await Promise.all([
      supabase
        .from("app_settings")
        .select("inventory_mode")
        .eq("id", "global")
        .maybeSingle(),
      supabase.from("inventory_items").select("*").order("name"),
      supabase.from("products").select("*").order("name"),
      supabase.from("product_stock").select("*"),
    ]);

  const finishedGoods =
    (settingsResult.data?.inventory_mode ?? "finished_goods") ===
    "finished_goods";
  const error = finishedGoods ? stockResult.error : ingredientsResult.error;

  return (
    <AdminShell title="Inventory">
      <p className="mb-4 max-w-2xl text-sm text-muted">
        {finishedGoods
          ? "receive ready-baked products into the vitrine. each sale deducts pieces; a cancelled sale puts them back."
          : "raw materials on the truck. sales auto-deduct through recipes. restock here after deliveries."}
      </p>
      {error ? (
        <div className="rounded-2xl border border-warn bg-warn/10 p-5 text-sm text-amber-950">
          {error.message}. if the table is missing, run{" "}
          <code>supabase/phase3.sql</code> and <code>phase3-seed.sql</code>.
        </div>
      ) : finishedGoods ? (
        <FinishedStockPanel
          products={productsResult.data ?? []}
          stock={stockResult.data ?? []}
        />
      ) : (ingredientsResult.data ?? []).length === 0 ? (
        <p className="text-muted">
          no inventory yet. run <code>supabase/phase3-seed.sql</code>.
        </p>
      ) : (
        <InventoryPanel items={ingredientsResult.data ?? []} />
      )}
    </AdminShell>
  );
}
