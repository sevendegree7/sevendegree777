"use client";

import { moveOrderStatus } from "@/app/kds/actions";
import { createOrder } from "@/app/pos/actions";
import { fetchKitchenOrder, fetchKitchenOrders } from "@/lib/kds/queries";
import { createClient } from "@/lib/supabase/client";

import { readCachedMenu, writeCachedMenu } from "./menu-cache";
import {
  loadFailed,
  loaded,
  type DataSource,
  type MenuSnapshot,
} from "./types";

// the online source: supabase for reads, the existing server actions for
// writes. writes stay on the server so prices and role checks are never
// decided by the browser - that rule does not change when the local source
// arrives, the local one will queue and let the server decide on sync.
export function createCloudSource(): DataSource {
  const supabase = createClient();

  return {
    kind: "cloud",

    async loadMenu() {
      const [categories, products, modifiers] = await Promise.all([
        supabase.from("categories").select("*").order("sort_order"),
        // only sellable items reach the grid
        supabase
          .from("products")
          .select("*")
          .eq("is_available", true)
          .order("sort_order"),
        supabase.from("modifiers").select("*").order("extra_price"),
      ]);

      const failed = categories.error ?? products.error ?? modifiers.error;

      if (failed) {
        // the menu is the one read that must survive with no internet:
        // without it there is nothing to sell. everything else still fails
        // honestly, because stale orders would be worse than none.
        const cached = readCachedMenu();

        return cached
          ? loaded<MenuSnapshot>(cached)
          : loadFailed<MenuSnapshot>(failed.message);
      }

      const snapshot: MenuSnapshot = {
        categories: categories.data ?? [],
        products: products.data ?? [],
        modifiers: modifiers.data ?? [],
        fetchedAt: new Date().toISOString(),
      };

      writeCachedMenu(snapshot);

      return loaded<MenuSnapshot>(snapshot);
    },

    async loadKitchenOrders() {
      const { orders, error } = await fetchKitchenOrders(supabase);
      return error ? loadFailed(error) : loaded(orders);
    },

    async loadKitchenOrder(orderId) {
      const { order, error } = await fetchKitchenOrder(supabase, orderId);
      return error ? loadFailed(error) : loaded(order);
    },

    submitOrder(input) {
      return createOrder(input);
    },

    moveStatus(input) {
      return moveOrderStatus(input);
    },
  };
}
