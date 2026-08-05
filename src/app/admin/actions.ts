"use server";

import { revalidatePath } from "next/cache";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type {
  InventoryMode,
  UserRole,
  WasteReason,
} from "@/types/database.types";

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
    .select("role, is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || !profile.is_active || profile.role !== "admin") {
    return { supabase, error: "admin only" as const };
  }

  return { supabase, error: null, userId: user.id };
}

// number fields arrive as raw input text. Number("") is 0, so parsing loosely
// would let a cleared price field save the product at zero and give it away.
function parseAmount(raw: string): number | null {
  const text = raw.trim();
  if (text === "") return null;

  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

// change price or availability on a product
export async function updateProduct(input: {
  productId: string;
  basePrice: string;
  isAvailable: boolean;
}): Promise<ActionResult> {
  const { supabase, error } = await requireAdmin();
  if (error) return { ok: false, message: error };

  const basePrice = parseAmount(input.basePrice);
  if (basePrice === null || basePrice < 0) {
    return { ok: false, message: "enter a price of zero or more" };
  }

  const { error: updateError } = await supabase
    .from("products")
    .update({
      base_price: basePrice,
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

// one reusable extra, offered on every product while active.
//
// product_id stays null. old product-owned rows remain supported by checkout,
// but admin creates global rows so "extra chocolate" has one price everywhere.
export async function createGlobalExtra(input: {
  name: string;
  extraPrice: string;
}): Promise<ActionResult> {
  const { supabase, error } = await requireAdmin();
  if (error) return { ok: false, message: error };

  const name = input.name.trim();
  const extraPrice = parseAmount(input.extraPrice);

  if (!name) {
    return { ok: false, message: "enter an extra name" };
  }

  if (extraPrice === null || extraPrice < 0) {
    return { ok: false, message: "enter a price of zero or more" };
  }

  const { data: existing, error: lookupError } = await supabase
    .from("modifiers")
    .select("name");

  if (lookupError) return { ok: false, message: lookupError.message };

  if (
    (existing ?? []).some(
      (modifier) => modifier.name.trim().toLowerCase() === name.toLowerCase(),
    )
  ) {
    return { ok: false, message: "an extra with this name already exists" };
  }

  const { error: insertError } = await supabase.from("modifiers").insert({
    product_id: null,
    name,
    extra_price: extraPrice,
    is_active: true,
  });

  if (insertError) return { ok: false, message: insertError.message };

  revalidatePath("/admin/menu");
  revalidatePath("/pos");
  revalidatePath("/menu");
  return { ok: true, message: "extra created for every item" };
}

export async function updateGlobalExtra(input: {
  modifierId: string;
  name: string;
  extraPrice: string;
  isActive: boolean;
}): Promise<ActionResult> {
  const { supabase, error } = await requireAdmin();
  if (error) return { ok: false, message: error };

  const name = input.name.trim();
  const extraPrice = parseAmount(input.extraPrice);

  if (!name) {
    return { ok: false, message: "enter an extra name" };
  }

  if (extraPrice === null || extraPrice < 0) {
    return { ok: false, message: "enter a price of zero or more" };
  }

  const { data: existing, error: lookupError } = await supabase
    .from("modifiers")
    .select("id, name")
    .neq("id", input.modifierId);

  if (lookupError) return { ok: false, message: lookupError.message };

  if (
    (existing ?? []).some(
      (modifier) => modifier.name.trim().toLowerCase() === name.toLowerCase(),
    )
  ) {
    return { ok: false, message: "an extra with this name already exists" };
  }

  const { error: updateError } = await supabase
    .from("modifiers")
    .update({
      // editing an old product-owned extra promotes it to the shared list
      product_id: null,
      name,
      extra_price: extraPrice,
      is_active: input.isActive,
    })
    .eq("id", input.modifierId);

  if (updateError) return { ok: false, message: updateError.message };

  revalidatePath("/admin/menu");
  revalidatePath("/pos");
  revalidatePath("/menu");
  return { ok: true, message: "extra saved" };
}

// add stock after a delivery.
// the add happens inside postgres (current_stock = current_stock + n) so a sale
// that deducts while the admin is typing is not overwritten. reading the stock
// here and writing the sum back used to erase that sale's deduct.
export async function restockItem(input: {
  itemId: string;
  addQuantity: string;
}): Promise<ActionResult> {
  const { supabase, error } = await requireAdmin();
  if (error) return { ok: false, message: error };

  const addQuantity = parseAmount(input.addQuantity);
  if (addQuantity === null || addQuantity <= 0) {
    return { ok: false, message: "add a positive quantity" };
  }

  const { data, error: rpcError } = await supabase.rpc(
    "restock_inventory_item",
    { p_item_id: input.itemId, p_add_quantity: addQuantity },
  );

  if (rpcError) {
    if (rpcError.code === "PGRST202" || rpcError.code === "42883") {
      // the ui message stays plain; the raw one is worth having in the log,
      // because "not in the schema cache" also covers a stale postgrest cache
      console.error("restock rpc missing", rpcError.code, rpcError.message);
      return {
        ok: false,
        message: "run supabase/phase3-fixes.sql in the sql editor first",
      };
    }
    return { ok: false, message: rpcError.message };
  }

  const payload = data as { ok?: boolean; message?: string } | null;
  if (payload && payload.ok === false) {
    return { ok: false, message: payload.message ?? "restock failed" };
  }

  revalidatePath("/admin/inventory");
  revalidatePath("/admin");
  return { ok: true, message: "stock updated" };
}

// set threshold for low stock warnings
export async function updateThreshold(input: {
  itemId: string;
  minThreshold: string;
}): Promise<ActionResult> {
  const { supabase, error } = await requireAdmin();
  if (error) return { ok: false, message: error };

  const minThreshold = parseAmount(input.minThreshold);
  if (minThreshold === null || minThreshold < 0) {
    return { ok: false, message: "enter a threshold of zero or more" };
  }

  const { error: updateError } = await supabase
    .from("inventory_items")
    .update({ min_threshold: minThreshold })
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

export async function logProductWaste(input: {
  productId: string;
  quantity: number;
  reason: WasteReason;
  notes: string | null;
}): Promise<ActionResult> {
  const { supabase, error } = await requireAdmin();
  if (error) return { ok: false, message: error };

  if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
    return { ok: false, message: "quantity must be positive" };
  }

  const { data, error: rpcError } = await supabase.rpc(
    "log_product_waste_and_deduct",
    {
      p_product_id: input.productId,
      p_quantity: input.quantity,
      p_reason: input.reason,
      p_notes: input.notes,
    },
  );

  if (rpcError) return { ok: false, message: rpcError.message };

  const payload = data as { ok?: boolean; message?: string } | null;
  if (payload?.ok === false) {
    return { ok: false, message: payload.message ?? "waste log failed" };
  }

  revalidatePath("/admin/inventory");
  revalidatePath("/admin/inventory/waste");
  revalidatePath("/admin");
  return { ok: true, message: "finished-product waste logged" };
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

export async function updateOperatingSettings(input: {
  kdsEnabled: boolean;
  inventoryMode: InventoryMode;
  receiptCopies: number;
}): Promise<ActionResult> {
  const { supabase, error } = await requireAdmin();
  if (error) return { ok: false, message: error };

  if (!["finished_goods", "ingredients"].includes(input.inventoryMode)) {
    return { ok: false, message: "invalid inventory mode" };
  }

  if (!Number.isInteger(input.receiptCopies) || input.receiptCopies < 1 || input.receiptCopies > 3) {
    return { ok: false, message: "receipt copies must be between 1 and 3" };
  }

  const { error: updateError } = await supabase
    .from("app_settings")
    .update({
      kds_enabled: input.kdsEnabled,
      inventory_mode: input.inventoryMode,
      receipt_copies: input.receiptCopies,
      updated_at: new Date().toISOString(),
    })
    .eq("id", "global");

  if (updateError) return { ok: false, message: updateError.message };

  revalidatePath("/admin/settings");
  revalidatePath("/pos");
  revalidatePath("/kds");
  return { ok: true, message: "operating settings saved" };
}

export async function receiveProductStock(input: {
  productId: string;
  addQuantity: string;
}): Promise<ActionResult> {
  const { supabase, error } = await requireAdmin();
  if (error) return { ok: false, message: error };

  const addQuantity = parseAmount(input.addQuantity);
  if (addQuantity === null || addQuantity <= 0) {
    return { ok: false, message: "add a positive quantity" };
  }

  const { data, error: rpcError } = await supabase.rpc(
    "receive_product_stock",
    { p_product_id: input.productId, p_add_quantity: addQuantity },
  );

  if (rpcError) return { ok: false, message: rpcError.message };

  const payload = data as { ok?: boolean; message?: string } | null;
  if (payload?.ok === false) {
    return { ok: false, message: payload.message ?? "receive failed" };
  }

  revalidatePath("/admin/inventory");
  revalidatePath("/admin");
  return { ok: true, message: "finished stock received" };
}

export async function updateProductStockThreshold(input: {
  productId: string;
  minThreshold: string;
}): Promise<ActionResult> {
  const { supabase, error } = await requireAdmin();
  if (error) return { ok: false, message: error };

  const minThreshold = parseAmount(input.minThreshold);
  if (minThreshold === null || minThreshold < 0) {
    return { ok: false, message: "enter a threshold of zero or more" };
  }

  const { data, error: rpcError } = await supabase.rpc(
    "set_product_stock_threshold",
    { p_product_id: input.productId, p_min_threshold: minThreshold },
  );

  if (rpcError) return { ok: false, message: rpcError.message };

  const payload = data as { ok?: boolean; message?: string } | null;
  if (payload?.ok === false) {
    return { ok: false, message: payload.message ?? "threshold failed" };
  }

  revalidatePath("/admin/inventory");
  revalidatePath("/admin");
  return { ok: true, message: "threshold saved" };
}

export async function createStaffAccount(input: {
  name: string;
  email: string;
  password: string;
  role: UserRole;
}): Promise<ActionResult> {
  const { error } = await requireAdmin();
  if (error) return { ok: false, message: error };

  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();

  if (!name || !email.includes("@") || input.password.length < 8) {
    return {
      ok: false,
      message: "enter a name, valid email, and password of at least 8 characters",
    };
  }

  if (!["admin", "cashier", "kitchen"].includes(input.role)) {
    return { ok: false, message: "invalid staff role" };
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch (caught) {
    return {
      ok: false,
      message: caught instanceof Error ? caught.message : "staff setup is missing",
    };
  }

  const { data, error: authError } = await admin.auth.admin.createUser({
    email,
    password: input.password,
    email_confirm: true,
    user_metadata: { name },
  });

  if (authError || !data.user) {
    return { ok: false, message: authError?.message ?? "could not create user" };
  }

  const { error: profileError } = await admin.from("profiles").insert({
    id: data.user.id,
    name,
    role: input.role,
    is_active: true,
  });

  if (profileError) {
    await admin.auth.admin.deleteUser(data.user.id);
    return { ok: false, message: profileError.message };
  }

  revalidatePath("/admin/users");
  return { ok: true, message: `${name} created` };
}

export async function setStaffActive(input: {
  userId: string;
  active: boolean;
}): Promise<ActionResult> {
  const { error, userId } = await requireAdmin();
  if (error) return { ok: false, message: error };

  if (input.userId === userId && !input.active) {
    return { ok: false, message: "you cannot disable your own account" };
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch (caught) {
    return {
      ok: false,
      message: caught instanceof Error ? caught.message : "staff setup is missing",
    };
  }

  const { error: profileError } = await admin
    .from("profiles")
    .update({ is_active: input.active })
    .eq("id", input.userId);

  if (profileError) return { ok: false, message: profileError.message };

  const { error: authError } = await admin.auth.admin.updateUserById(
    input.userId,
    { ban_duration: input.active ? "none" : "876000h" },
  );

  if (authError) return { ok: false, message: authError.message };

  revalidatePath("/admin/users");
  return { ok: true, message: input.active ? "account enabled" : "account disabled" };
}
