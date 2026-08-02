"use client";

import { useSyncExternalStore } from "react";

import { getUnsyncedCount, subscribeUnsyncedCount } from "./order-store";

// how many sales are still only on this tablet.
//
// the server has no idea, so it renders zero and the real number appears on
// the client - the same shape as the connection watcher.
export function useUnsyncedSales(): number {
  return useSyncExternalStore(subscribeUnsyncedCount, getUnsyncedCount, () => 0);
}
