import { RoleShell } from "@/components/role-shell";
import type { MenuSnapshot } from "@/lib/data/types";
import { createClient } from "@/lib/supabase/server";

import { PosScreen } from "./pos-screen";

// cashier home - loads the menu on the server then hands it to the touch ui.
// if that read fails we hand over null and the screen asks the data source
// itself, which is also the path a tablet with no internet will take.
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

  const initialMenu: MenuSnapshot | null = loadError
    ? null
    : {
        categories: categoriesResult.data ?? [],
        products: productsResult.data ?? [],
        modifiers: modifiersResult.data ?? [],
        fetchedAt: new Date().toISOString(),
      };

  return (
    <RoleShell title="pos" roleLabel="cashier">
      <PosScreen initialMenu={initialMenu} />
    </RoleShell>
  );
}
