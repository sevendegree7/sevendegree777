"use server";

import { buildShiftReport, type ShiftReport } from "@/lib/pos/shift-report";
import { EMPTY_TODAY_SALES, type TodaySales } from "@/lib/pos/today-sales";
import { createClient } from "@/lib/supabase/server";
import type { Shift } from "@/types/database.types";

// opening and closing the drawer.
//
// only one shift is open at a time - the database enforces that with a partial
// unique index, because this is one tablet with one drawer and two people who
// take turns at it. everything here is deliberately forgiving except that.

export type ShiftSummary = {
  shift: Shift;
  report: ShiftReport;
};

type Actor = { id: string; name: string };

// the same three checks every till action makes. a plain message beats the raw
// policy error rls would otherwise return.
async function requireTillUser(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<{ ok: true; actor: Actor } | { ok: false; message: string }> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return { ok: false, message: "session expired. sign in again." };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("name, role, is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (
    !profile ||
    !profile.is_active ||
    (profile.role !== "cashier" && profile.role !== "admin")
  ) {
    return { ok: false, message: "this account cannot open or close a shift" };
  }

  return { ok: true, actor: { id: user.id, name: profile.name } };
}

async function summarise(
  supabase: Awaited<ReturnType<typeof createClient>>,
  shift: Shift,
): Promise<ShiftSummary> {
  const { data: orders } = await supabase
    .from("orders")
    .select(
      "id, total_amount, payment_method, status, created_by_name, is_diyafa",
    )
    .eq("shift_id", shift.id)
    .is("archived_at", null);

  const list = orders ?? [];
  const orderIds = list.map((order) => order.id);

  const { data: itemRows } =
    orderIds.length > 0
      ? await supabase
          .from("order_items")
          .select("order_id, quantity, unit_price, product_id")
          .in("order_id", orderIds)
      : { data: [] };

  const productIds = [
    ...new Set(
      (itemRows ?? [])
        .map((row) => row.product_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  ];

  const { data: products } =
    productIds.length > 0
      ? await supabase
          .from("products")
          .select("id, category_id")
          .in("id", productIds)
      : { data: [] };

  const categoryIds = [
    ...new Set(
      (products ?? [])
        .map((product) => product.category_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  ];

  const { data: categories } =
    categoryIds.length > 0
      ? await supabase
          .from("categories")
          .select("id, name, sort_order")
          .in("id", categoryIds)
      : { data: [] };

  const categoryByProduct = new Map(
    (products ?? []).map((product) => [product.id, product.category_id]),
  );
  const categoryById = new Map(
    (categories ?? []).map((category) => [
      category.id,
      { name: category.name, sort: category.sort_order },
    ]),
  );

  const lines = (itemRows ?? []).map((row) => {
    const categoryId = row.product_id
      ? (categoryByProduct.get(row.product_id) ?? null)
      : null;
    const category = categoryId ? categoryById.get(categoryId) : undefined;
    return {
      order_id: row.order_id,
      quantity: Number(row.quantity),
      unit_price: Number(row.unit_price),
      category_id: categoryId,
      category_name: category?.name ?? null,
      category_sort: category?.sort ?? null,
    };
  });

  return {
    shift,
    report: buildShiftReport({
      orders: list,
      lines,
      openingFloat: Number(shift.opening_float),
      countedCash: shift.counted_cash === null ? null : Number(shift.counted_cash),
    }),
  };
}

export type OpenShiftResult =
  | { ok: true; summary: ShiftSummary }
  | { ok: false; message: string };

export async function openShift(
  openingFloat: number,
): Promise<OpenShiftResult> {
  if (!Number.isFinite(openingFloat) || openingFloat < 0) {
    return { ok: false, message: "the opening float has to be zero or more" };
  }

  const supabase = await createClient();
  const gate = await requireTillUser(supabase);
  if (!gate.ok) return gate;

  const { data: shift, error } = await supabase
    .from("shifts")
    .insert({
      opened_by: gate.actor.id,
      opened_by_name: gate.actor.name,
      opening_float: openingFloat,
    })
    .select("*")
    .single();

  if (error || !shift) {
    // the partial unique index. somebody else already has the drawer, which is
    // worth saying plainly rather than as a constraint name.
    const open = await currentShift();

    if (open.shift) {
      return {
        ok: false,
        message: `${open.shift.opened_by_name} already has a shift open. close it before starting a new one.`,
      };
    }

    return { ok: false, message: "could not open the shift. try again." };
  }

  return { ok: true, summary: await summarise(supabase, shift) };
}

export type CloseShiftResult =
  | { ok: true; summary: ShiftSummary }
  | { ok: false; message: string };

// countedCash is null when the cashier closes without counting - allowed, and
// reported as "not counted" rather than quietly as a balanced drawer.
export async function closeShift(
  countedCash: number | null,
): Promise<CloseShiftResult> {
  if (
    countedCash !== null &&
    (!Number.isFinite(countedCash) || countedCash < 0)
  ) {
    return { ok: false, message: "the counted cash has to be zero or more" };
  }

  const supabase = await createClient();
  const gate = await requireTillUser(supabase);
  if (!gate.ok) return gate;

  const { data: open } = await supabase
    .from("shifts")
    .select("*")
    .is("closed_at", null)
    .maybeSingle();

  if (!open) {
    return { ok: false, message: "there is no shift open to close" };
  }

  // matched on closed_at again so two tablets - or two taps - cannot both close
  // the same shift and write two different counts over each other
  const { data: closed, error } = await supabase
    .from("shifts")
    .update({
      closed_by: gate.actor.id,
      closed_by_name: gate.actor.name,
      closed_at: new Date().toISOString(),
      counted_cash: countedCash,
    })
    .eq("id", open.id)
    .is("closed_at", null)
    .select("*")
    .maybeSingle();

  if (error || !closed) {
    return { ok: false, message: "the shift changed. refresh and try again." };
  }

  return { ok: true, summary: await summarise(supabase, closed) };
}

// the open shift and what it currently adds up to, for the bar on the till.
// answers with nulls rather than an error when there is no shift open, because
// that is the normal state first thing in the morning.
export async function currentShift(): Promise<{
  shift: Shift | null;
  report: ShiftReport | null;
}> {
  const supabase = await createClient();

  const { data: shift } = await supabase
    .from("shifts")
    .select("*")
    .is("closed_at", null)
    .maybeSingle();

  if (!shift) return { shift: null, report: null };

  const summary = await summarise(supabase, shift);
  return { shift: summary.shift, report: summary.report };
}

// takings for the open shift only. closing the shift ends this number; the
// next open starts from zero. not a calendar day.
export async function todaySales(): Promise<TodaySales> {
  const open = await currentShift();
  if (!open.report) return EMPTY_TODAY_SALES;

  return {
    orderCount: open.report.orderCount,
    salesTotal: open.report.salesTotal,
  };
}

// the last few closed shifts, so the owner can reprint a report they walked
// away from without printing
export async function recentShifts(limit = 10): Promise<Shift[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("shifts")
    .select("*")
    .not("closed_at", "is", null)
    .order("opened_at", { ascending: false })
    .limit(Math.max(1, Math.min(50, Math.floor(limit))));

  return data ?? [];
}

export type ShiftReportResult =
  | { ok: true; summary: ShiftSummary }
  | { ok: false; message: string };

export async function shiftReport(shiftId: string): Promise<ShiftReportResult> {
  const supabase = await createClient();

  const { data: shift } = await supabase
    .from("shifts")
    .select("*")
    .eq("id", shiftId)
    .maybeSingle();

  if (!shift) return { ok: false, message: "that shift no longer exists" };

  return { ok: true, summary: await summarise(supabase, shift) };
}
