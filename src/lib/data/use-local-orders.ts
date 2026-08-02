"use client";

import { useMemo, useSyncExternalStore } from "react";

import type { KitchenOrder } from "@/lib/kds/orders";

import {
  getLocalOrdersSnapshot,
  getServerSnapshot,
  subscribeLocalOrders,
} from "./order-store";

// the tickets that live on this tablet only, ready for the kitchen board.
//
// an uploaded sale is dropped: from that moment the cloud copy is the one the
// whole shop can see, and showing both would be the same ticket twice.
export function useLocalOrders(): KitchenOrder[] {
  const records = useSyncExternalStore(
    subscribeLocalOrders,
    getLocalOrdersSnapshot,
    getServerSnapshot,
  );

  return useMemo(
    () =>
      records
        .filter((local) => local.syncedOrderId === null)
        .map((local) => local.order),
    [records],
  );
}
