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
  | {
      ok: true;
      status: OrderStatus;
      changed: boolean;
      // the move went through but the stock did not come back with it. the
      // ticket is still cancelled, so this is a note for the screen, not a
      // failure.
      stockWarning?: string;
    }
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
    .select("role, is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (
    !profile ||
    !profile.is_active ||
    (profile.role !== "kitchen" && profile.role !== "admin")
  ) {
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
    // this screen is the one that cancelled it, so this screen is the one that
    // puts the ingredients back. only on `changed`: a screen whose tap lost the
    // race never deducted anything to return, and the rpc refuses a second run
    // anyway - `stock_deducted` is cleared in the same transaction that adds
    // the stock.
    if (updated.status === "cancelled") {
      const { error: returnError } = await supabase.rpc(
        "return_stock_for_order",
        { p_order_id: input.orderId },
      );

      if (returnError) {
        // the ticket is cancelled either way. saying it out loud beats a
        // silent drift, and admin can restock by hand from /admin/inventory.
        console.error("stock return failed", returnError.message);

        return {
          ok: true,
          status: updated.status,
          changed: true,
          stockWarning:
            "the order was cancelled, but the stock did not go back. fix it in admin > inventory.",
        };
      }
    }

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
