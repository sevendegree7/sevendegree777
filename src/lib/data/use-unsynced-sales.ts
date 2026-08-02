"use client";

import { useSyncExternalStore } from "react";

import {
  getUnsyncedCount,
  getUploadError,
  subscribeLocalOrders,
} from "./order-store";

// how many sales are still only on this tablet.
//
// the server has no idea, so it renders zero and the real number appears on
// the client - the same shape as the connection watcher.
export function useUnsyncedSales(): number {
  return useSyncExternalStore(subscribeLocalOrders, getUnsyncedCount, () => 0);
}

// why a waiting sale did not go up, if one was refused. a sale that cannot
// upload has to be visible: it is money the shop has taken and the books have
// not seen, and somebody has to be told what to fix.
export function useUploadError(): string | null {
  return useSyncExternalStore(
    subscribeLocalOrders,
    getUploadError,
    () => null,
  );
}
