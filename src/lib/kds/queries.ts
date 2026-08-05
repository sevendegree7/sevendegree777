import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Order, OrderItem } from "@/types/database.types";

import { KITCHEN_STATUSES, type KitchenOrder } from "./orders";

// works with both the server client (first paint) and the browser client
// (realtime refetches), so the board is built by one piece of code.
export type KdsClient = SupabaseClient<Database>;

export type KitchenOrdersResult = {
  orders: KitchenOrder[];
  error: string | null;
};

// numeric(10,2) can come back as a string from postgrest, so every price
// gets forced to a number before any math or formatting touches it
function normalizeOrder(row: Order): Order {
  return { ...row, total_amount: Number(row.total_amount) };
}

function normalizeItem(row: OrderItem): OrderItem {
  return {
    ...row,
    unit_price: Number(row.unit_price),
    selected_modifiers: (row.selected_modifiers ?? []).map((modifier) => ({
      ...modifier,
      extra_price: Number(modifier.extra_price),
    })),
  };
}

// lines for a set of orders, grouped by order id in one round trip
async function fetchItemsByOrder(
  supabase: KdsClient,
  orderIds: string[],
): Promise<{ items: Map<string, OrderItem[]>; error: string | null }> {
  const items = new Map<string, OrderItem[]>();

  if (orderIds.length === 0) {
    return { items, error: null };
  }

  const { data, error } = await supabase
    .from("order_items")
    .select("*")
    .in("order_id", orderIds)
    .order("created_at", { ascending: true });

  if (error) {
    return { items, error: error.message };
  }

  for (const row of data ?? []) {
    const line = normalizeItem(row);
    const existing = items.get(line.order_id);

    if (existing) {
      existing.push(line);
    } else {
      items.set(line.order_id, [line]);
    }
  }

  return { items, error: null };
}

// everything currently on the kitchen board, oldest first
export async function fetchKitchenOrders(
  supabase: KdsClient,
): Promise<KitchenOrdersResult> {
  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .in("status", [...KITCHEN_STATUSES])
    .order("created_at", { ascending: true });

  if (error) {
    return { orders: [], error: error.message };
  }

  const rows = data ?? [];
  const { items, error: itemsError } = await fetchItemsByOrder(
    supabase,
    rows.map((row) => row.id),
  );

  if (itemsError) {
    return { orders: [], error: itemsError };
  }

  return {
    orders: rows.map((row) => ({
      ...normalizeOrder(row),
      items: items.get(row.id) ?? [],
    })),
    error: null,
  };
}

// the order history behind the till: every sale since a given instant,
// newest first, whatever status it ended on.
//
// this is not the kitchen board and must not be filtered like one. a cashier
// looking something up needs the completed ones (that is most of them) and the
// cancelled ones too, because "why is this ticket gone" is exactly the
// question the history is there to answer.
export async function fetchRecentOrders(
  supabase: KdsClient,
  sinceIso: string,
): Promise<KitchenOrdersResult> {
  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false });

  if (error) {
    return { orders: [], error: error.message };
  }

  const rows = data ?? [];
  const { items, error: itemsError } = await fetchItemsByOrder(
    supabase,
    rows.map((row) => row.id),
  );

  if (itemsError) {
    return { orders: [], error: itemsError };
  }

  return {
    orders: rows.map((row) => ({
      ...normalizeOrder(row),
      items: items.get(row.id) ?? [],
    })),
    error: null,
  };
}

// one ticket after a realtime event.
// order_items is not in the realtime publication, so the lines are always
// fetched here rather than read off the event payload.
export async function fetchKitchenOrder(
  supabase: KdsClient,
  orderId: string,
): Promise<{ order: KitchenOrder | null; error: string | null }> {
  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .maybeSingle();

  if (error) {
    return { order: null, error: error.message };
  }

  if (!data) {
    return { order: null, error: null };
  }

  const { items, error: itemsError } = await fetchItemsByOrder(supabase, [
    orderId,
  ]);

  if (itemsError) {
    return { order: null, error: itemsError };
  }

  return {
    order: { ...normalizeOrder(data), items: items.get(orderId) ?? [] },
    error: null,
  };
}
