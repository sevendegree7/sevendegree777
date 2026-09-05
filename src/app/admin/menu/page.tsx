import { Suspense } from "react";

import { AdminShell } from "@/components/admin-shell";
import { createClient } from "@/lib/supabase/server";

import { ExtrasManager } from "./extras-manager";
import { MenuTabs, ProductManager } from "./product-manager";

export default async function AdminMenuPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const params = await searchParams;
  const tab = params.tab === "extras" ? "extras" : "products";
  const supabase = await createClient();

  const [productsResult, categoriesResult, extrasResult, stockResult] =
    await Promise.all([
      supabase.from("products").select("*").order("sort_order"),
      supabase.from("categories").select("*").order("sort_order"),
      supabase.from("modifiers").select("*").order("created_at"),
      supabase.from("product_stock").select("*"),
    ]);

  const loadError =
    productsResult.error ?? categoriesResult.error ?? extrasResult.error;

  return (
    <AdminShell titleKey="admin.nav.menu">
      <Suspense fallback={null}>
        <MenuTabs />
      </Suspense>

      {loadError ? (
        <p className="text-danger">{loadError.message}</p>
      ) : tab === "extras" ? (
        <ExtrasManager extras={extrasResult.data ?? []} />
      ) : (
        <ProductManager
          products={productsResult.data ?? []}
          categories={categoriesResult.data ?? []}
          stock={stockResult.data ?? []}
        />
      )}
    </AdminShell>
  );
}
