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

  // finished goods only tracks what is still on sale. archived bakery leftovers
  // and dunkin-style boxes (assembled from flavors) stay out of the vitrine list.
  const vitrineProducts = (productsResult.data ?? []).filter(
    (product) =>
      product.is_available &&
      (product.piece_count === null || product.piece_count === undefined),
  );

  return (
    <AdminShell title="Inventory">
      <p className="mb-4 max-w-2xl text-sm text-muted">
        {finishedGoods
          ? "Receive ready-baked products into the vitrine. Each sale deducts pieces; a cancelled sale puts them back. Boxes are packed from these pieces, so they are not stocked here."
          : "Raw materials on the truck. Sales auto-deduct through recipes. Restock here after deliveries."}
      </p>
      {error ? (
        <div className="rounded-2xl border border-warn bg-warn/10 p-5 text-sm text-amber-950">
          {error.message}. If the table is missing, run{" "}
          <code>supabase/phase3.sql</code> and <code>phase3-seed.sql</code>.
        </div>
      ) : finishedGoods ? (
        vitrineProducts.length === 0 ? (
          <p className="text-muted">
            No available products to stock. Add desserts on the Menu page first.
          </p>
        ) : (
          <FinishedStockPanel
            products={vitrineProducts}
            stock={stockResult.data ?? []}
          />
        )
      ) : (ingredientsResult.data ?? []).length === 0 ? (
        <p className="text-muted">
          No inventory yet. Run <code>supabase/phase3-seed.sql</code> only if
          you switch to ingredient mode.
        </p>
      ) : (
        <InventoryPanel items={ingredientsResult.data ?? []} />
      )}
    </AdminShell>
  );
}
