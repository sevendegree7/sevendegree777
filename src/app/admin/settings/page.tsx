import { AdminShell } from "@/components/admin-shell";
import { createClient } from "@/lib/supabase/server";
import type { AppSettings } from "@/types/database.types";

import { SettingsForm } from "./settings-form";

export default async function AdminSettingsPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("app_settings")
    .select("*")
    .eq("id", "global")
    .maybeSingle();

  const settings: AppSettings = data ?? {
    id: "global",
    kds_enabled: false,
    inventory_mode: "finished_goods",
    receipt_copies: 2,
    updated_at: new Date().toISOString(),
  };

  return (
    <AdminShell title="Operating settings">
      {error ? (
        <p className="mb-4 rounded-xl bg-warn/15 p-4 text-sm text-warn">
          {error.message}. apply the launch-hardening migration first.
        </p>
      ) : null}
      <SettingsForm settings={settings} />
    </AdminShell>
  );
}
