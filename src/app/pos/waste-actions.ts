"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import type { WasteReason } from "@/types/database.types";

export type WasteActionResult =
  | { ok: true; message?: string }
  | { ok: false; message: string };

const REASONS: WasteReason[] = [
  "burnt",
  "dropped",
  "expired",
  "spoiled",
  "remake",
  "other",
];

// finished-product waste from the till. needs the shop PIN from settings.
// works with or without an open shift — waste is about stock, not the drawer.
export async function logTillProductWaste(input: {
  pin: string;
  productId: string;
  quantity: string;
  reason: string;
  notes: string | null;
}): Promise<WasteActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { ok: false, message: "session expired. sign in again." };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (
    !profile ||
    !profile.is_active ||
    (profile.role !== "cashier" && profile.role !== "admin")
  ) {
    return { ok: false, message: "this account cannot log waste" };
  }

  const { data: settings } = await supabase
    .from("app_settings")
    .select("waste_pin")
    .eq("id", "global")
    .maybeSingle();

  const expected = (settings?.waste_pin ?? "").trim();
  if (!expected) {
    return {
      ok: false,
      message: "no waste PIN set. ask admin to set one in settings.",
    };
  }

  if (input.pin.trim() !== expected) {
    return { ok: false, message: "wrong PIN" };
  }

  if (!input.productId) {
    return { ok: false, message: "pick a product" };
  }

  const quantity = Number(input.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return { ok: false, message: "quantity must be positive" };
  }

  if (!REASONS.includes(input.reason as WasteReason)) {
    return { ok: false, message: "pick a waste reason" };
  }
  const reason = input.reason as WasteReason;

  const { data, error: rpcError } = await supabase.rpc(
    "log_product_waste_and_deduct",
    {
      p_product_id: input.productId,
      p_quantity: quantity,
      p_reason: reason,
      p_notes: (input.notes ?? "").trim() || null,
    },
  );

  if (rpcError) return { ok: false, message: rpcError.message };

  const payload = data as { ok?: boolean; message?: string } | null;
  if (payload?.ok === false) {
    return { ok: false, message: payload.message ?? "waste log failed" };
  }

  revalidatePath("/pos");
  revalidatePath("/admin/inventory");
  revalidatePath("/admin/inventory/waste");
  return { ok: true, message: "waste logged" };
}
