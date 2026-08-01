"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import type { WasteReason } from "@/types/database.types";

export type ActionResult =
  | { ok: true; message?: string }
  | { ok: false; message: string };

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { supabase, error: "session expired. sign in again." as const };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || profile.role !== "admin") {
    return { supabase, error: "admin only" as const };
  }

  return { supabase, error: null, userId: user.id };
}

// change price or availability on a product
export async function updateProduct(input: {
  productId: string;
  basePrice: number;
  isAvailable: boolean;
}): Promise<ActionResult> {
  const { supabase, error } = await requireAdmin();
  if (error) return { ok: false, message: error };

  if (!Number.isFinite(input.basePrice) || input.basePrice < 0) {
    return { ok: false, message: "price must be zero or more" };
  }

  const { error: updateError } = await supabase
    .from("products")
    .update({
      base_price: input.basePrice,
      is_available: input.isAvailable,
    })
    .eq("id", input.productId);

  if (updateError) {
    return { ok: false, message: updateError.message };
  }

  revalidatePath("/admin/menu");
  revalidatePath("/pos");
  return { ok: true, message: "product saved" };
}

// add stock after a delivery
export async function restockItem(input: {
  itemId: string;
  addQuantity: number;
}): Promise<ActionResult> {
  const { supabase, error } = await requireAdmin();
  if (error) return { ok: false, message: error };

  if (!Number.isFinite(input.addQuantity) || input.addQuantity <= 0) {
    return { ok: false, message: "add a positive quantity" };
  }

  const { data: item, error: readError } = await supabase
    .from("inventory_items")
    .select("current_stock")
    .eq("id", input.itemId)
    .maybeSingle();

  if (readError || !item) {
    return { ok: false, message: "inventory item not found" };
  }

  const next = Number(item.current_stock) + input.addQuantity;

  const { error: updateError } = await supabase
    .from("inventory_items")
    .update({ current_stock: next })
    .eq("id", input.itemId);

  if (updateError) {
    return { ok: false, message: updateError.message };
  }

  revalidatePath("/admin/inventory");
  revalidatePath("/admin");
  return { ok: true, message: "stock updated" };
}

// set threshold for low stock warnings
export async function updateThreshold(input: {
  itemId: string;
  minThreshold: number;
}): Promise<ActionResult> {
  const { supabase, error } = await requireAdmin();
  if (error) return { ok: false, message: error };

  if (!Number.isFinite(input.minThreshold) || input.minThreshold < 0) {
    return { ok: false, message: "threshold must be zero or more" };
  }

  const { error: updateError } = await supabase
    .from("inventory_items")
    .update({ min_threshold: input.minThreshold })
    .eq("id", input.itemId);

  if (updateError) {
    return { ok: false, message: updateError.message };
  }

  revalidatePath("/admin/inventory");
  revalidatePath("/admin");
  return { ok: true };
}

// burnt / dropped / expired etc - pulls stock without counting as sales
export async function logWaste(input: {
  itemId: string;
  quantity: number;
  reason: WasteReason;
  notes: string | null;
}): Promise<ActionResult> {
  const { error } = await requireAdmin();
  if (error) return { ok: false, message: error };

  if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
    return { ok: false, message: "quantity must be positive" };
  }

  const supabase = await createClient();
  const { data, error: rpcError } = await supabase.rpc("log_waste_and_deduct", {
    p_inventory_item_id: input.itemId,
    p_quantity: input.quantity,
    p_reason: input.reason,
    p_notes: input.notes,
  });

  if (rpcError) {
    return { ok: false, message: rpcError.message };
  }

  const payload = data as { ok?: boolean; message?: string } | null;
  if (payload && payload.ok === false) {
    return { ok: false, message: payload.message ?? "waste log failed" };
  }

  revalidatePath("/admin/inventory");
  revalidatePath("/admin/inventory/waste");
  revalidatePath("/admin");
  return { ok: true, message: "waste logged" };
}

// change how much of an ingredient one product uses
export async function upsertRecipe(input: {
  productId: string;
  inventoryItemId: string;
  quantityRequired: number;
}): Promise<ActionResult> {
  const { supabase, error } = await requireAdmin();
  if (error) return { ok: false, message: error };

  if (!Number.isFinite(input.quantityRequired) || input.quantityRequired <= 0) {
    return { ok: false, message: "quantity must be positive" };
  }

  const { data: existing } = await supabase
    .from("recipes")
    .select("id")
    .eq("product_id", input.productId)
    .eq("inventory_item_id", input.inventoryItemId)
    .maybeSingle();

  if (existing) {
    const { error: updateError } = await supabase
      .from("recipes")
      .update({ quantity_required: input.quantityRequired })
      .eq("id", existing.id);

    if (updateError) return { ok: false, message: updateError.message };
  } else {
    const { error: insertError } = await supabase.from("recipes").insert({
      product_id: input.productId,
      inventory_item_id: input.inventoryItemId,
      quantity_required: input.quantityRequired,
    });

    if (insertError) return { ok: false, message: insertError.message };
  }

  revalidatePath("/admin/recipes");
  return { ok: true, message: "recipe saved" };
}

export async function deleteRecipe(recipeId: string): Promise<ActionResult> {
  const { supabase, error } = await requireAdmin();
  if (error) return { ok: false, message: error };

  const { error: deleteError } = await supabase
    .from("recipes")
    .delete()
    .eq("id", recipeId);

  if (deleteError) return { ok: false, message: deleteError.message };

  revalidatePath("/admin/recipes");
  return { ok: true };
}
