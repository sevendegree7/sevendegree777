import { AdminShell } from "@/components/admin-shell";
import { createClient } from "@/lib/supabase/server";

import { ExtrasManager } from "./extras-manager";
import { MenuEditor } from "./menu-editor";

export default async function AdminMenuPage() {
  const supabase = await createClient();

  const [productsResult, categoriesResult, extrasResult] = await Promise.all([
    supabase.from("products").select("*").order("sort_order"),
    supabase.from("categories").select("id, name"),
    supabase.from("modifiers").select("*").order("created_at"),
  ]);

  const categoryNameById: Record<string, string> = {};
  for (const category of categoriesResult.data ?? []) {
    categoryNameById[category.id] = category.name;
  }

  return (
    <AdminShell title="Menu">
      <p className="mb-4 max-w-2xl text-sm text-muted">
        Change prices, manage shared extras, and turn items on or off. Updates
        reach the till on its next menu refresh.
      </p>
      {productsResult.error || extrasResult.error ? (
        <p className="text-danger">
          {productsResult.error?.message ?? extrasResult.error?.message}
        </p>
      ) : (
        <>
          <ExtrasManager extras={extrasResult.data ?? []} />
          <MenuEditor
            products={productsResult.data ?? []}
            categoryNameById={categoryNameById}
          />
        </>
      )}
    </AdminShell>
  );
}
