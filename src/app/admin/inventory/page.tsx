import { AdminShell } from "@/components/admin-shell";
import { createClient } from "@/lib/supabase/server";

import { InventoryPanel } from "./inventory-panel";

export default async function AdminInventoryPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("inventory_items")
    .select("*")
    .order("name");

  return (
    <AdminShell title="inventory">
      <p className="mb-4 max-w-2xl text-sm text-stone-600">
        raw materials on the truck. sales auto-deduct through recipes. restock
        here after deliveries.
      </p>
      {error ? (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-950">
          {error.message}. if the table is missing, run{" "}
          <code>supabase/phase3.sql</code> and <code>phase3-seed.sql</code>.
        </div>
      ) : (data ?? []).length === 0 ? (
        <p className="text-stone-600">
          no inventory yet. run <code>supabase/phase3-seed.sql</code>.
        </p>
      ) : (
        <InventoryPanel items={data ?? []} />
      )}
    </AdminShell>
  );
}
