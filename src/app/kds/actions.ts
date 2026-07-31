"use server";

import { canMove } from "@/lib/kds/orders";
import { createClient } from "@/lib/supabase/server";
import type { OrderStatus } from "@/types/database.types";

export type MoveStatusInput = {
  orderId: string;
  // status the screen thinks the ticket is on right now
  from: OrderStatus;
  to: OrderStatus;
};

export type MoveStatusResult =
  | { ok: true; status: OrderStatus; changed: boolean }
  | { ok: false; message: string };

// moves one ticket along the kitchen pipeline.
// the browser only sends ids and the move it wants, never a free status.
export async function moveOrderStatus(
  input: MoveStatusInput,
): Promise<MoveStatusResult> {
  if (!canMove(input.from, input.to)) {
    return { ok: false, message: "that status move is not allowed" };
  }

  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { ok: false, message: "session expired. sign in again." };
  }

  // rls blocks this too, but a plain message beats a raw policy error
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || (profile.role !== "kitchen" && profile.role !== "admin")) {
    return { ok: false, message: "this account cannot change orders" };
  }

  // matching on the old status too, so two kitchen screens tapping the same
  // ticket cannot walk it backwards - the slower tap just changes nothing
  const { data: updated, error: updateError } = await supabase
    .from("orders")
    .update({ status: input.to })
    .eq("id", input.orderId)
    .eq("status", input.from)
    .select("status")
    .maybeSingle();

  if (updateError) {
    return { ok: false, message: "could not update the order. try again." };
  }

  if (updated) {
    return { ok: true, status: updated.status, changed: true };
  }

  // nothing matched: another screen already moved it. report where it landed
  // instead of failing, so both screens end up showing the same thing.
  const { data: current } = await supabase
    .from("orders")
    .select("status")
    .eq("id", input.orderId)
    .maybeSingle();

  if (!current) {
    return { ok: false, message: "that order no longer exists" };
  }

  return { ok: true, status: current.status, changed: false };
}
