import { RoleShell } from "@/components/role-shell";
import type { MenuSnapshot } from "@/lib/data/types";
import { startOfTruckDayIso } from "@/lib/reports/dates";
import { createClient } from "@/lib/supabase/server";
import type { AppSettings } from "@/types/database.types";

import { PosScreen } from "./pos-screen";
import { currentShift } from "./shift-actions";

// cashier home - loads the menu on the server then hands it to the touch ui.
// if that read fails we hand over null and the screen asks the data source
// itself, which is also the path a tablet with no internet will take.
export default async function PosPage() {
  const supabase = await createClient();

  // who is at the till. only used so a sale rung with no internet can print
  // the cashier's name before it has ever reached the server.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [
    categoriesResult,
    productsResult,
    modifiersResult,
    settingsResult,
    ticketResult,
    profileResult,
    shift,
  ] = await Promise.all([
    supabase.from("categories").select("*").order("sort_order"),
    // only sellable items reach the grid
    supabase
      .from("products")
      .select("*")
      .eq("is_available", true)
      .order("sort_order"),
    supabase.from("modifiers").select("*").order("extra_price"),
    supabase.from("app_settings").select("*").eq("id", "global").maybeSingle(),
    supabase
      .from("orders")
      .select("ticket_date, ticket_number")
      .gte("created_at", startOfTruckDayIso())
      .order("ticket_number", { ascending: false })
      .limit(1)
      .maybeSingle(),
    // the role comes with the name: voiding and editing a sale are admin-only,
    // and the till hides those buttons rather than offering a cashier a button
    // that will only ever answer "no".
    user
      ? supabase
          .from("profiles")
          .select("name, role")
          .eq("id", user.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    // whoever has the drawer right now. answers with nulls rather than throwing
    // when nothing is open, so the bar renders either way.
    currentShift(),
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

  const initialSettings: AppSettings = settingsResult.data ?? {
    id: "global",
    kds_enabled: false,
    inventory_mode: "finished_goods",
    receipt_copies: 2,
    updated_at: new Date().toISOString(),
  };

  return (
    <RoleShell title="POS" roleLabel="Cashier">
      <PosScreen
        initialMenu={initialMenu}
        initialSettings={initialSettings}
        initialTicketDate={ticketResult.data?.ticket_date ?? null}
        initialTicketNumber={ticketResult.data?.ticket_number ?? 0}
        cashierName={profileResult.data?.name ?? null}
        canVoid={profileResult.data?.role === "admin"}
        initialShift={shift.shift}
        initialShiftReport={shift.report}
      />
    </RoleShell>
  );
}
