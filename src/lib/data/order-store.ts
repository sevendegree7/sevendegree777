"use client";

import type { MoveStatusResult } from "@/app/kds/actions";
import { canMove, type KitchenOrder } from "@/lib/kds/orders";
import type { OrderStatus } from "@/types/database.types";

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
  // why the last upload attempt was refused, so the till can say it out loud
  // instead of leaving a sale stuck with no explanation. cleared on the
  // attempt that works. missing on records written before the sync worker.
  syncError?: string | null;
};

// storage is full, disabled, or holds something from an older build. none of
// that should take the till down, so reads drop what they cannot understand.
function isLocalOrder(value: unknown): value is LocalOrder {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as {
    order?: unknown;
    syncedOrderId?: unknown;
    syncError?: unknown;
  };
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
      typeof candidate.syncedOrderId === "string") &&
    (candidate.syncError === undefined ||
      candidate.syncError === null ||
      typeof candidate.syncError === "string")
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

// the sales on this tablet as something a screen can watch: the till shows how
// many are waiting, the kitchen board shows the tickets themselves. the same
// one-store-per-tab shape as the connection watcher, so what is on screen can
// never drift from what is actually in storage.
//
// same array until something really changes, or every notify would re-render
// both screens for nothing.
const EMPTY: LocalOrder[] = [];

let cached: LocalOrder[] = EMPTY;
let unsyncedCount = 0;
let uploadError: string | null = null;
let listeners: (() => void)[] = [];

// everything a screen can see about a ticket. a status move changes no count,
// so counting is not enough to know the board has to redraw.
function signature(orders: LocalOrder[]): string {
  return orders
    .map(
      (local) =>
        `${local.order.client_id}~${local.order.status}~${local.order.updated_at}~${local.syncedOrderId ?? ""}~${local.syncError ?? ""}`,
    )
    .join("|");
}

function onStorageEvent() {
  // fired by the other tab: the kitchen screen and the till are often both
  // open on the tablet
  refreshLocalOrders();
}

export function refreshLocalOrders(): void {
  const next = listLocalOrders();

  if (signature(next) === signature(cached)) {
    return;
  }

  cached = next;
  unsyncedCount = next.filter((local) => local.syncedOrderId === null).length;
  uploadError = next.find((local) => local.syncError)?.syncError ?? null;

  for (const listener of listeners) {
    listener();
  }
}

export function getLocalOrdersSnapshot(): LocalOrder[] {
  return cached;
}

// the server has none of these. one shared empty array, because a new one
// every call is a render loop.
export function getServerSnapshot(): LocalOrder[] {
  return EMPTY;
}

export function getUnsyncedCount(): number {
  return unsyncedCount;
}

// the reason the oldest stuck sale gave. one message, not a list: the till has
// a strip of chips, and the fix for the first one usually fixes the rest.
export function getUploadError(): string | null {
  return uploadError;
}

export function subscribeLocalOrders(listener: () => void): () => void {
  listeners = [...listeners, listener];

  if (listeners.length === 1) {
    window.addEventListener("storage", onStorageEvent);
  }

  // storage may already hold sales from before this screen opened
  refreshLocalOrders();

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
  refreshLocalOrders();

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

  refreshLocalOrders();

  return next;
}

// the board works in order ids, storage is keyed by client_id
export function findLocalByOrderId(orderId: string): LocalOrder | null {
  return (
    listLocalOrders().find((local) => local.order.id === orderId) ?? null
  );
}

// moves a ticket that is still only on this tablet.
//
// this has to work with the internet up as well as down: the sale is not in
// supabase until the sync worker uploads it, so the server has nothing to
// move. the answer matches the server action's shape so the board treats both
// kinds of ticket the same way.
export function moveLocalStatus(
  orderId: string,
  from: OrderStatus,
  to: OrderStatus,
): MoveStatusResult {
  if (!canMove(from, to)) {
    return { ok: false, message: "that status move is not allowed" };
  }

  const existing = findLocalByOrderId(orderId);

  if (!existing || !existing.order.client_id) {
    return { ok: false, message: "that ticket is not on this tablet" };
  }

  // the other tab already moved it. report where it landed instead of
  // failing, exactly like the server does when the old status no longer
  // matches, so both screens end up showing the same thing.
  if (existing.order.status !== from) {
    return { ok: true, status: existing.order.status, changed: false };
  }

  const moved = updateLocalOrder(existing.order.client_id, (current) => ({
    ...current,
    order: { ...current.order, status: to, updated_at: new Date().toISOString() },
  }));

  if (!moved) {
    return {
      ok: false,
      message: "could not save that move on this tablet. try again.",
    };
  }

  return { ok: true, status: to, changed: true };
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

  refreshLocalOrders();
}
