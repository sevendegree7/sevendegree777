import { AdminShell } from "@/components/admin-shell";
import { createClient } from "@/lib/supabase/server";

import { MenuEditor } from "./menu-editor";

export default async function AdminMenuPage() {
  const supabase = await createClient();

  const [productsResult, categoriesResult] = await Promise.all([
    supabase.from("products").select("*").order("sort_order"),
    supabase.from("categories").select("id, name"),
  ]);

  const categoryNameById: Record<string, string> = {};
  for (const category of categoriesResult.data ?? []) {
    categoryNameById[category.id] = category.name;
  }

  return (
    <AdminShell title="Menu">
      <p className="mb-4 max-w-2xl text-sm text-muted">
        change prices and turn items on/off. unavailable products disappear from
        the pos grid on the next load.
      </p>
      {productsResult.error ? (
        <p className="text-danger">{productsResult.error.message}</p>
      ) : (
        <MenuEditor
          products={productsResult.data ?? []}
          categoryNameById={categoryNameById}
        />
      )}
    </AdminShell>
  );
}
