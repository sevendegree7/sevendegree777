"use server";

import { revalidatePath } from "next/cache";

import { isTaxMode, normaliseLabel, normaliseRate } from "@/lib/pos/tax";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type {
  InventoryMode,
  TaxMode,
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

// create or update a sellable item. boxes need a pack size and a contents
// category so the till knows how many flavors to ask for.
export async function createProduct(input: {
  name: string;
  categoryId: string;
  basePrice: string;
  isAvailable: boolean;
  pieceCount: string;
  contentsCategoryId: string;
  openingStock?: string;
}): Promise<ActionResult> {
  const { supabase, error } = await requireAdmin();
  if (error) return { ok: false, message: error };

  const name = input.name.trim();
  if (!name) return { ok: false, message: "enter a product name" };
  if (!input.categoryId) {
    return { ok: false, message: "pick a category" };
  }

  const basePrice = parseAmount(input.basePrice);
  if (basePrice === null || basePrice < 0) {
    return { ok: false, message: "enter a price of zero or more" };
  }

  const { data: category, error: categoryError } = await supabase
    .from("categories")
    .select("id, name")
    .eq("id", input.categoryId)
    .maybeSingle();

  if (categoryError) return { ok: false, message: categoryError.message };
  if (!category) return { ok: false, message: "category not found" };

  const isBox = category.name.toLowerCase() === "boxes";
  let pieceCount: number | null = null;
  let contentsCategoryId: string | null = null;

  if (isBox) {
    const parsed = parseAmount(input.pieceCount);
    if (parsed === null || !Number.isInteger(parsed) || parsed <= 0) {
      return { ok: false, message: "enter how many pieces the box holds" };
    }
    if (!input.contentsCategoryId) {
      return { ok: false, message: "pick what the box contains" };
    }

    pieceCount = parsed;
    contentsCategoryId = input.contentsCategoryId;
  }

  const openingStock = parseAmount(input.openingStock ?? "");
  if (openingStock !== null && openingStock < 0) {
    return { ok: false, message: "stock must be zero or more" };
  }

  const { data: existing } = await supabase
    .from("products")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const sortOrder = (existing?.sort_order ?? 0) + 1;

  const { data: created, error: insertError } = await supabase
    .from("products")
    .insert({
      name,
      category_id: input.categoryId,
      base_price: basePrice,
      is_available: input.isAvailable,
      sort_order: sortOrder,
      piece_count: pieceCount,
      contents_category_id: contentsCategoryId,
    })
    .select("id")
    .single();

  if (insertError || !created) {
    return { ok: false, message: insertError?.message ?? "could not create product" };
  }

  // finished-goods stock needs a row before the first delivery is logged.
  // opening stock is optional: leave it blank and the shelf starts at zero.
  await supabase.from("product_stock").upsert(
    {
      product_id: created.id,
      current_stock: isBox || openingStock === null ? 0 : openingStock,
    },
    { onConflict: "product_id" },
  );

  revalidatePath("/admin/menu");
  revalidatePath("/admin/inventory");
  revalidatePath("/pos");
  revalidatePath("/menu");
  return { ok: true, message: "product created" };
}

export async function updateProduct(input: {
  productId: string;
  name: string;
  categoryId: string;
  basePrice: string;
  isAvailable: boolean;
  pieceCount: string;
  contentsCategoryId: string;
}): Promise<ActionResult> {
  const { supabase, error } = await requireAdmin();
  if (error) return { ok: false, message: error };

  const name = input.name.trim();
  if (!name) return { ok: false, message: "enter a product name" };
  if (!input.categoryId) {
    return { ok: false, message: "pick a category" };
  }

  const basePrice = parseAmount(input.basePrice);
  if (basePrice === null || basePrice < 0) {
    return { ok: false, message: "enter a price of zero or more" };
  }

  const { data: category, error: categoryError } = await supabase
    .from("categories")
    .select("id, name")
    .eq("id", input.categoryId)
    .maybeSingle();

  if (categoryError) return { ok: false, message: categoryError.message };
  if (!category) return { ok: false, message: "category not found" };

  const isBox = category.name.toLowerCase() === "boxes";
  let pieceCount: number | null = null;
  let contentsCategoryId: string | null = null;

  if (isBox) {
    const parsed = parseAmount(input.pieceCount);
    if (parsed === null || !Number.isInteger(parsed) || parsed <= 0) {
      return { ok: false, message: "enter how many pieces the box holds" };
    }
    if (!input.contentsCategoryId) {
      return { ok: false, message: "pick what the box contains" };
    }

    pieceCount = parsed;
    contentsCategoryId = input.contentsCategoryId;
  }

  const { error: updateError } = await supabase
    .from("products")
    .update({
      name,
      category_id: input.categoryId,
      base_price: basePrice,
      is_available: input.isAvailable,
      piece_count: pieceCount,
      contents_category_id: contentsCategoryId,
    })
    .eq("id", input.productId);

  if (updateError) {
    return { ok: false, message: updateError.message };
  }

  revalidatePath("/admin/menu");
  revalidatePath("/pos");
  revalidatePath("/menu");
  return { ok: true, message: "product saved" };
}

export async function archiveProduct(input: {
  productId: string;
  archive: boolean;
}): Promise<ActionResult> {
  const { supabase, error } = await requireAdmin();
  if (error) return { ok: false, message: error };

  const { error: updateError } = await supabase
    .from("products")
    .update({ is_available: !input.archive })
    .eq("id", input.productId);

  if (updateError) {
    return { ok: false, message: updateError.message };
  }

  revalidatePath("/admin/menu");
  revalidatePath("/pos");
  revalidatePath("/menu");
  return {
    ok: true,
    message: input.archive ? "product archived" : "product restored",
  };
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
  taxEnabled: boolean;
  taxLabel: string;
  // arrives as typed, because "14." is a thing a keyboard produces halfway
  // through typing 14.5 and the form must not fight the person using it
  taxRate: string;
  taxMode: TaxMode;
}): Promise<ActionResult> {
  const { supabase, error } = await requireAdmin();
  if (error) return { ok: false, message: error };

  if (!["finished_goods", "ingredients"].includes(input.inventoryMode)) {
    return { ok: false, message: "invalid inventory mode" };
  }

  if (!Number.isInteger(input.receiptCopies) || input.receiptCopies < 1 || input.receiptCopies > 3) {
    return { ok: false, message: "receipt copies must be between 1 and 3" };
  }

  if (!isTaxMode(input.taxMode)) {
    return { ok: false, message: "invalid tax mode" };
  }

  const taxLabel = normaliseLabel(input.taxLabel);
  const taxRate = normaliseRate(input.taxRate);

  // only worth complaining about when they meant to turn it on. saving with
  // tax off and an empty rate is a perfectly ordinary thing to do.
  if (input.taxEnabled && taxRate <= 0) {
    return {
      ok: false,
      message: "set a tax percentage between 0 and 100 before turning tax on",
    };
  }

  const { error: updateError } = await supabase
    .from("app_settings")
    .update({
      kds_enabled: input.kdsEnabled,
      inventory_mode: input.inventoryMode,
      receipt_copies: input.receiptCopies,
      tax_enabled: input.taxEnabled,
      tax_label: taxLabel,
      tax_rate: taxRate,
      tax_mode: input.taxMode,
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

// overwrite the count on the shelf. receive only adds, so a typo (20 instead
// of 12) had no way back down without logging fake waste.
export async function setProductStock(input: {
  productId: string;
  quantity: string;
}): Promise<ActionResult> {
  const { supabase, error } = await requireAdmin();
  if (error) return { ok: false, message: error };

  const quantity = parseAmount(input.quantity);
  if (quantity === null || quantity < 0) {
    return { ok: false, message: "enter a stock of zero or more" };
  }

  const { data: product } = await supabase
    .from("products")
    .select("id, piece_count")
    .eq("id", input.productId)
    .maybeSingle();

  if (!product) return { ok: false, message: "product not found" };
  if (product.piece_count) {
    return { ok: false, message: "boxes are packed from other items, so they have no stock of their own" };
  }

  const { error: upsertError } = await supabase.from("product_stock").upsert(
    {
      product_id: input.productId,
      current_stock: quantity,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "product_id" },
  );

  if (upsertError) return { ok: false, message: upsertError.message };

  revalidatePath("/admin/menu");
  revalidatePath("/admin/inventory");
  revalidatePath("/admin");
  return { ok: true, message: "stock updated" };
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

// collect an agel debt. cashier can ring it; only admin can say it was paid.
export async function settleAgelDebt(input: {
  orderId: string;
  paymentMethod: "cash" | "card" | "instapay";
}): Promise<ActionResult> {
  const { supabase, error, userId } = await requireAdmin();
  if (error) return { ok: false, message: error };
  if (!userId) return { ok: false, message: "admin only" };

  if (
    input.paymentMethod !== "cash" &&
    input.paymentMethod !== "card" &&
    input.paymentMethod !== "instapay"
  ) {
    return { ok: false, message: "pick cash, card or instapay" };
  }

  const { data: order, error: readError } = await supabase
    .from("orders")
    .select(
      "id, payment_method, agel_settled_at, status, total_amount, customer_name",
    )
    .eq("id", input.orderId)
    .maybeSingle();

  if (readError || !order) {
    return { ok: false, message: "order not found" };
  }

  if (order.payment_method !== "agel") {
    return { ok: false, message: "this order is not agel" };
  }

  if (order.status === "cancelled") {
    return { ok: false, message: "cancelled orders cannot be settled" };
  }

  if (order.agel_settled_at) {
    return { ok: false, message: "already settled" };
  }

  const { error: updateError } = await supabase
    .from("orders")
    .update({
      agel_settled_at: new Date().toISOString(),
      agel_settled_by: userId,
      agel_settled_payment_method: input.paymentMethod,
    })
    .eq("id", input.orderId)
    .is("agel_settled_at", null);

  if (updateError) {
    return { ok: false, message: updateError.message };
  }

  revalidatePath("/admin/debts");
  revalidatePath("/admin/reports");
  return {
    ok: true,
    message: `settled ${order.customer_name ?? "debt"} · ${input.paymentMethod}`,
  };
}

// void one or more tickets from admin > orders. stock is returned the same way
// as voiding from the till.
export async function cancelAdminOrders(
  orderIds: string[],
): Promise<ActionResult & { cancelled?: number }> {
  const { error } = await requireAdmin();
  if (error) return { ok: false, message: error };

  const unique = [...new Set(orderIds.filter(Boolean))];
  if (unique.length === 0) {
    return { ok: false, message: "pick at least one order" };
  }

  const { cancelOrder } = await import("@/app/pos/actions");

  let cancelled = 0;
  let lastWarning: string | undefined;

  for (const orderId of unique) {
    const result = await cancelOrder(orderId);
    if (!result.ok) {
      return {
        ok: false,
        message: result.message,
        cancelled,
      };
    }
    cancelled += 1;
    if (result.warning) lastWarning = result.warning;
  }

  revalidatePath("/admin/orders");
  revalidatePath("/admin/reports");
  revalidatePath("/admin/debts");
  revalidatePath("/admin");

  return {
    ok: true,
    cancelled,
    message:
      lastWarning ??
      `cancelled ${cancelled} ticket${cancelled === 1 ? "" : "s"}`,
  };
}

// wipe every order row. for clearing test data before go-live — restores stock
// first, then hard-deletes via the service role (rls has no delete policy).
export async function purgeAllOrders(
  confirmation: string,
): Promise<ActionResult & { removed?: number }> {
  const { supabase, error } = await requireAdmin();
  if (error) return { ok: false, message: error };

  if (confirmation.trim() !== "DELETE ALL ORDERS") {
    return {
      ok: false,
      message: 'type DELETE ALL ORDERS exactly to confirm',
    };
  }

  const { data: live, error: listError } = await supabase
    .from("orders")
    .select("id")
    .neq("status", "cancelled");

  if (listError) {
    return { ok: false, message: listError.message };
  }

  for (const row of live ?? []) {
    const { error: cancelError } = await supabase
      .from("orders")
      .update({ status: "cancelled" })
      .eq("id", row.id)
      .neq("status", "cancelled");

    if (cancelError) {
      return { ok: false, message: cancelError.message };
    }

    await supabase.rpc("return_stock_for_order", { p_order_id: row.id });
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch (caught) {
    return {
      ok: false,
      message:
        caught instanceof Error ? caught.message : "server setup is missing",
    };
  }

  const { count, error: countError } = await admin
    .from("orders")
    .select("id", { count: "exact", head: true });

  if (countError) {
    return { ok: false, message: countError.message };
  }

  const removed = count ?? 0;

  const { error: deleteError } = await admin
    .from("orders")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");

  if (deleteError) {
    return { ok: false, message: deleteError.message };
  }

  await admin
    .from("daily_ticket_counters")
    .delete()
    .gte("next_number", 0);

  revalidatePath("/admin/orders");
  revalidatePath("/admin/reports");
  revalidatePath("/admin/debts");
  revalidatePath("/admin");
  revalidatePath("/pos");

  return {
    ok: true,
    removed,
    message: `removed ${removed} order${removed === 1 ? "" : "s"}. ticket numbers start again from 1 today.`,
  };
}

