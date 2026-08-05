import { RoleShell } from "@/components/role-shell";
import { fetchKitchenOrders } from "@/lib/kds/queries";
import { createClient } from "@/lib/supabase/server";

import { KdsScreen } from "./kds-screen";

// kitchen home - first paint is server rendered, then realtime takes over
export default async function KdsPage() {
  const supabase = await createClient();
  const { data: settings } = await supabase
    .from("app_settings")
    .select("kds_enabled")
    .eq("id", "global")
    .maybeSingle();

  const kdsEnabled = settings?.kds_enabled ?? false;
  const { orders, error } = kdsEnabled
    ? await fetchKitchenOrders(supabase)
    : { orders: [], error: null };

  return (
    <RoleShell title="Kitchen display" roleLabel="Kitchen">
      {!kdsEnabled ? (
        <div className="rounded-2xl bg-raised p-6 shadow-sm">
          <h2 className="text-xl font-medium">Kitchen display is off</h2>
          <p className="mt-2 text-muted">
            Cashier-only mode is active. Admin can enable KDS from Settings.
          </p>
        </div>
      ) : error ? (
        <div className="rounded-2xl bg-raised p-6 shadow-sm">
          <h2 className="text-xl font-medium">Orders did not load</h2>
          <p className="mt-2 text-muted">{error}</p>
          <p className="mt-2 text-sm text-muted">
            Check the Supabase keys in .env.local and that schema.sql was run.
          </p>
        </div>
      ) : (
        <KdsScreen initialOrders={orders} />
      )}
    </RoleShell>
  );
}
