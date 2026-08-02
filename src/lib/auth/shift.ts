"use client";

import { useSyncExternalStore } from "react";

import { isUserRole, type UserRole } from "./roles";

// who this tablet is open as, written down on the device.
//
// with no internet there is nobody to ask. the pages come out of the service
// worker cache, the proxy never runs, and supabase cannot answer a thing - so
// the tablet has to remember the shift it opened while it still had a line to
// the server.
//
// this is not a credential and it cannot be used as one. no token and no
// password is kept here: the supabase session cookies are still the only thing
// that lets anything reach the server, and the server checks the role again on
// every write. all this decides is which screen a tablet with no internet is
// allowed to open, which is a question that has no other answer offline.
const KEY = "seven-degree.shift";

export type Shift = {
  userId: string;
  name: string;
  role: UserRole;
  // last time the server confirmed this. shown on the offline screen, because
  // a record from three weeks ago is worth seeing before you trust it.
  savedAt: string;
};

// same rule as the offline orders: storage can hold something from an older
// build, and a shape we do not understand is treated as no shift at all.
function isShift(value: unknown): value is Shift {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<Shift>;

  return (
    typeof candidate.userId === "string" &&
    typeof candidate.name === "string" &&
    typeof candidate.role === "string" &&
    isUserRole(candidate.role) &&
    typeof candidate.savedAt === "string"
  );
}

// straight from storage, for the moments where waiting for a subscription to
// settle would mean sending someone to the wrong screen first
export function readShift(): Shift | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(KEY);

    if (!raw) {
      return null;
    }

    const parsed: unknown = JSON.parse(raw);

    return isShift(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

// the watchable copy, same one-store-per-tab shape as the connection watcher
// and the offline orders
let cached: Shift | null = null;
let signature = "";
let listeners: (() => void)[] = [];

function signatureOf(shift: Shift | null): string {
  return shift
    ? `${shift.userId}~${shift.name}~${shift.role}~${shift.savedAt}`
    : "";
}

function refresh(): void {
  const next = readShift();
  const nextSignature = signatureOf(next);

  if (nextSignature === signature) {
    return;
  }

  cached = next;
  signature = nextSignature;

  for (const listener of listeners) {
    listener();
  }
}

function onStorageEvent() {
  // the other tab signed out, or opened the shift. the till and the kitchen
  // board are both open on this tablet and must agree on who is on it.
  refresh();
}

export function subscribeShift(listener: () => void): () => void {
  listeners = [...listeners, listener];

  if (listeners.length === 1) {
    window.addEventListener("storage", onStorageEvent);
  }

  // storage already holds the shift from before this screen opened
  refresh();

  return () => {
    listeners = listeners.filter((entry) => entry !== listener);

    if (listeners.length === 0) {
      window.removeEventListener("storage", onStorageEvent);
    }
  };
}

export function getShiftSnapshot(): Shift | null {
  return cached;
}

// the server never knows the tablet's shift, so it renders as none and the
// real one appears on the client
export function useShift(): Shift | null {
  return useSyncExternalStore(subscribeShift, getShiftSnapshot, () => null);
}

// called after the server has confirmed who this is - on sign in, and on every
// screen that opens with a connection
export function saveShift(shift: Shift): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(KEY, JSON.stringify(shift));
  } catch {
    // storage full or blocked. the tablet just will not open offline, which
    // is better than pretending it can.
    return;
  }

  refresh();
}

// signing out closes the shift on the device too, otherwise the cached till
// would still open for whoever picks the tablet up next
export function clearShift(): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // nothing to do
  }

  refresh();
}
