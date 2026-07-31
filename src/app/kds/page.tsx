import { RoleShell } from "@/components/role-shell";
import { fetchKitchenOrders } from "@/lib/kds/queries";
import { createClient } from "@/lib/supabase/server";

import { KdsScreen } from "./kds-screen";

// kitchen home - first paint is server rendered, then realtime takes over
export default async function KdsPage() {
  const supabase = await createClient();
  const { orders, error } = await fetchKitchenOrders(supabase);

  return (
    <RoleShell title="kitchen display" roleLabel="kitchen">
      {error ? (
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="text-xl font-medium">orders did not load</h2>
          <p className="mt-2 text-stone-600">{error}</p>
          <p className="mt-2 text-sm text-stone-500">
            check the supabase keys in .env.local and that schema.sql was run.
          </p>
        </div>
      ) : (
        <KdsScreen initialOrders={orders} />
      )}
    </RoleShell>
  );
}
