import { AdminShell } from "@/components/admin-shell";
import { createClient } from "@/lib/supabase/server";

import { RecipesPanel } from "./recipes-panel";

export default async function AdminRecipesPage() {
  const supabase = await createClient();

  const [productsResult, inventoryResult, recipesResult] = await Promise.all([
    supabase.from("products").select("*").order("name"),
    supabase.from("inventory_items").select("*").order("name"),
    supabase.from("recipes").select("*").order("created_at"),
  ]);

  const loadError =
    productsResult.error ?? inventoryResult.error ?? recipesResult.error;

  return (
    <AdminShell title="Recipes">
      <p className="mb-4 max-w-2xl text-sm text-muted">
        bill of materials. when a cashier sells a product, these quantities are
        deducted from inventory automatically.
      </p>
      {loadError ? (
        <p className="text-danger">{loadError.message}</p>
      ) : (
        <RecipesPanel
          products={productsResult.data ?? []}
          inventory={inventoryResult.data ?? []}
          recipes={recipesResult.data ?? []}
        />
      )}
    </AdminShell>
  );
}
