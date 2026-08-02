"use client";

import type { KitchenOrder } from "@/lib/kds/orders";

// sales taken while the tablet had no internet, kept until they are uploaded.
//
// one key per order, never one big list: two screens open in two tabs would
// otherwise read the same list, add their own sale, and write back over each
// other. a sale lost that way is money lost.
//
// localstorage and not indexeddb because the reads are synchronous and a day
// of orders is a few hundred kilobytes. if the truck ever keeps weeks of them
// this is the thing to swap - nothing outside this file knows where they live.
const PREFIX = "seven-degree.order.";

export type LocalOrder = {
  // exactly what the kitchen board and the receipt need, same shape as cloud
  order: KitchenOrder;
  // the id supabase gave this sale once it was uploaded. null means it is
  // still only on this tablet.
  syncedOrderId: string | null;
};

// storage is full, disabled, or holds something from an older build. none of
// that should take the till down, so reads drop what they cannot understand.
function isLocalOrder(value: unknown): value is LocalOrder {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as { order?: unknown; syncedOrderId?: unknown };
  const order = candidate.order as Partial<KitchenOrder> | undefined;

  return (
    typeof order === "object" &&
    order !== null &&
    typeof order.id === "string" &&
    typeof order.client_id === "string" &&
    typeof order.created_at === "string" &&
    typeof order.status === "string" &&
    Array.isArray(order.items) &&
    (candidate.syncedOrderId === null ||
      typeof candidate.syncedOrderId === "string")
  );
}

function keyFor(clientId: string): string {
  return `${PREFIX}${clientId}`;
}

export function readLocalOrder(clientId: string): LocalOrder | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(keyFor(clientId));

    if (!raw) {
      return null;
    }

    const parsed: unknown = JSON.parse(raw);

    return isLocalOrder(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

// oldest first, the same order the kitchen works in
export function listLocalOrders(): LocalOrder[] {
  if (typeof window === "undefined") {
    return [];
  }

  const found: LocalOrder[] = [];

  try {
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);

      if (!key || !key.startsWith(PREFIX)) {
        continue;
      }

      const raw = window.localStorage.getItem(key);

      if (!raw) {
        continue;
      }

      const parsed: unknown = JSON.parse(raw);

      if (isLocalOrder(parsed)) {
        found.push(parsed);
      }
    }
  } catch {
    return found;
  }

  return found.sort(
    (a, b) =>
      new Date(a.order.created_at).getTime() -
      new Date(b.order.created_at).getTime(),
  );
}

export function listUnsyncedOrders(): LocalOrder[] {
  return listLocalOrders().filter((local) => local.syncedOrderId === null);
}

export function countUnsyncedOrders(): number {
  return listUnsyncedOrders().length;
}

// how many sales are still only on this tablet, as something a screen can
// watch. the same one-store-per-tab shape as the connection watcher, so a
// count on screen can never drift from what is actually in storage.
let unsyncedCount = 0;
let listeners: (() => void)[] = [];

function onStorageEvent() {
  // fired by the other tab: the kitchen screen and the till are often both
  // open on the tablet
  refreshUnsyncedCount();
}

export function refreshUnsyncedCount(): void {
  const next = countUnsyncedOrders();

  if (next === unsyncedCount) {
    return;
  }

  unsyncedCount = next;

  for (const listener of listeners) {
    listener();
  }
}

export function getUnsyncedCount(): number {
  return unsyncedCount;
}

export function subscribeUnsyncedCount(listener: () => void): () => void {
  listeners = [...listeners, listener];

  if (listeners.length === 1) {
    window.addEventListener("storage", onStorageEvent);
  }

  // storage may already hold sales from before this screen opened
  refreshUnsyncedCount();

  return () => {
    listeners = listeners.filter((entry) => entry !== listener);

    if (listeners.length === 0) {
      window.removeEventListener("storage", onStorageEvent);
    }
  };
}

// writes a new sale. an existing one with the same client_id is returned
// untouched, exactly like the server returns the first order when the same
// checkout arrives twice - a re-tap must never become a second sale, and it
// must never reset a ticket the kitchen already started.
//
// throws when the write fails. a sale that was not stored must never be
// reported to the cashier as taken.
export function saveLocalOrder(order: KitchenOrder): LocalOrder {
  const clientId = order.client_id;

  if (!clientId) {
    throw new Error("a local order needs a client id");
  }

  const existing = readLocalOrder(clientId);

  if (existing) {
    return existing;
  }

  const record: LocalOrder = { order, syncedOrderId: null };

  window.localStorage.setItem(keyFor(clientId), JSON.stringify(record));
  refreshUnsyncedCount();

  return record;
}

// for a status move on the board, or for marking a sale as uploaded
export function updateLocalOrder(
  clientId: string,
  change: (current: LocalOrder) => LocalOrder,
): LocalOrder | null {
  const existing = readLocalOrder(clientId);

  if (!existing) {
    return null;
  }

  const next = change(existing);

  try {
    window.localStorage.setItem(keyFor(clientId), JSON.stringify(next));
  } catch {
    return null;
  }

  refreshUnsyncedCount();

  return next;
}

export function removeLocalOrder(clientId: string): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem(keyFor(clientId));
  } catch {
    // nothing to do. it will be skipped as already synced.
  }

  refreshUnsyncedCount();
}
