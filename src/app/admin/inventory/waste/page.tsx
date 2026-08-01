import { AdminShell } from "@/components/admin-shell";
import { createClient } from "@/lib/supabase/server";

import { WasteForm } from "./waste-form";

export default async function AdminWastePage() {
  const supabase = await createClient();

  const [itemsResult, logsResult] = await Promise.all([
    supabase.from("inventory_items").select("*").order("name"),
    supabase
      .from("waste_logs")
      .select("id, quantity, reason, notes, created_at, inventory_item_id")
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const nameById: Record<string, string> = {};
  for (const item of itemsResult.data ?? []) {
    nameById[item.id] = `${item.name} (${item.unit})`;
  }

  return (
    <AdminShell title="waste">
      <p className="mb-4 max-w-2xl text-sm text-stone-600">
        log burnt, dropped, or spoiled stock. this lowers inventory and does not
        count as sales revenue.
      </p>

      {itemsResult.error ? (
        <p className="text-red-700">{itemsResult.error.message}</p>
      ) : (
        <WasteForm items={itemsResult.data ?? []} />
      )}

      <div className="mt-8 rounded-2xl bg-white p-5 shadow-sm">
        <h2 className="text-lg font-medium">recent waste</h2>
        {logsResult.error ? (
          <p className="mt-2 text-sm text-stone-600">{logsResult.error.message}</p>
        ) : (logsResult.data ?? []).length === 0 ? (
          <p className="mt-2 text-sm text-stone-500">no waste logs yet</p>
        ) : (
          <ul className="mt-3 divide-y divide-stone-100 text-sm">
            {(logsResult.data ?? []).map((log) => (
              <li key={log.id} className="flex justify-between gap-3 py-3">
                <span>
                  {nameById[log.inventory_item_id] ?? "item"} · {log.reason} ·{" "}
                  {Number(log.quantity)}
                  {log.notes ? ` · ${log.notes}` : ""}
                </span>
                <span className="shrink-0 text-stone-400">
                  {new Date(log.created_at).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AdminShell>
  );
}
