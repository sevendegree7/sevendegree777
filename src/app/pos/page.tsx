import { RoleShell } from "@/components/role-shell";
import { createClient } from "@/lib/supabase/server";

import { PosScreen } from "./pos-screen";

// cashier home - loads the menu on the server then hands it to the touch ui
export default async function PosPage() {
  const supabase = await createClient();

  const [categoriesResult, productsResult, modifiersResult] = await Promise.all([
    supabase.from("categories").select("*").order("sort_order"),
    // only sellable items reach the grid
    supabase
      .from("products")
      .select("*")
      .eq("is_available", true)
      .order("sort_order"),
    supabase.from("modifiers").select("*").order("extra_price"),
  ]);

  const loadError =
    categoriesResult.error ?? productsResult.error ?? modifiersResult.error;

  return (
    <RoleShell title="pos" roleLabel="cashier">
      {loadError ? (
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="text-xl font-medium">menu did not load</h2>
          <p className="mt-2 text-stone-600">{loadError.message}</p>
          <p className="mt-2 text-sm text-stone-500">
            check the supabase keys in .env.local and that schema.sql and
            seed.sql were run.
          </p>
        </div>
      ) : (
        <PosScreen
          categories={categoriesResult.data ?? []}
          products={productsResult.data ?? []}
          modifiers={modifiersResult.data ?? []}
        />
      )}
    </RoleShell>
  );
}
