"use client";

import { useSyncExternalStore } from "react";

// one shared connection watcher for the whole tab, mirroring the shared clock
// in src/lib/kds/use-now.ts. pos and kds both read it, one ping loop runs.
//
// "checking" only shows before the first ping answers.
// "syncing" means we can reach supabase but local orders are still waiting to
// upload - phase 4 track b sets that count with setPendingSync.
export type ConnectionState = "checking" | "online" | "offline" | "syncing";

type Reachable = "checking" | "online" | "offline";

// gotrue answers this without a session. it is the smallest thing on the
// supabase host that proves the network path to our project actually works.
const PING_PATH = "/auth/v1/health";

const PING_TIMEOUT_MS = 4000;
const ONLINE_EVERY_MS = 20000;
const OFFLINE_EVERY_MS = 5000;
// a failed ping while we think we are online is retried fast before believing it
const RETRY_SOON_MS = 2000;
// one dropped ping is a wobble, two in a row is an outage. the cashier gets
// card payments blocked when we say offline, so a single blip must not do that.
const FAILURES_BEFORE_OFFLINE = 2;

let reachable: Reachable = "checking";
let pendingSync = 0;
let snapshot: ConnectionState = "checking";
let failures = 0;

let timer: ReturnType<typeof setTimeout> | null = null;
let checking: Promise<ConnectionState> | null = null;

const listeners = new Set<() => void>();

function publish() {
  const next: ConnectionState =
    reachable === "online" && pendingSync > 0 ? "syncing" : reachable;

  if (next === snapshot) {
    return;
  }

  snapshot = next;

  for (const listener of listeners) {
    listener();
  }
}

function clearTimer() {
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
}

function scheduleNext() {
  clearTimer();

  if (listeners.size === 0) {
    return;
  }

  const delay =
    reachable === "offline"
      ? OFFLINE_EVERY_MS
      : failures > 0
        ? RETRY_SOON_MS
        : ONLINE_EVERY_MS;

  timer = setTimeout(() => {
    void runCheck();
  }, delay);
}

async function pingSupabase(): Promise<boolean> {
  // navigator.onLine is only trustworthy when it says false: no link at all.
  // "true" on truck wifi with a dead uplink is exactly the lie we ping past.
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return false;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return false;
  }

  const controller = new AbortController();
  // a hanging request is an outage too, so it does not get to sit there
  const abort = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);

  try {
    const response = await fetch(`${url}${PING_PATH}`, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
      headers: { apikey: key },
    });

    // any answer under 500 means the request reached supabase, which is what
    // we are asking. 5xx means the project itself cannot serve us right now.
    return response.status < 500;
  } catch {
    return false;
  } finally {
    clearTimeout(abort);
  }
}

async function runCheck(): Promise<ConnectionState> {
  // one ping at a time, extra callers wait for the one already in flight
  if (checking) {
    return checking;
  }

  clearTimer();

  checking = (async () => {
    const alive = await pingSupabase();

    if (alive) {
      failures = 0;
      reachable = "online";
    } else {
      failures += 1;

      // first answer of the session is reported straight away, no grace
      if (failures >= FAILURES_BEFORE_OFFLINE || reachable === "checking") {
        reachable = "offline";
      }
    }

    publish();
    return snapshot;
  })();

  try {
    return await checking;
  } finally {
    checking = null;
    scheduleNext();
  }
}

function onBrowserOffline() {
  // the device itself says the link is gone, believe that half immediately
  failures = FAILURES_BEFORE_OFFLINE;
  reachable = "offline";
  publish();
  scheduleNext();
}

function onBrowserOnline() {
  void runCheck();
}

function onVisibilityChange() {
  // a tablet that slept can wake with a stale state, re-ask on the way back
  if (document.visibilityState === "visible") {
    void runCheck();
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);

  if (listeners.size === 1) {
    window.addEventListener("online", onBrowserOnline);
    window.addEventListener("offline", onBrowserOffline);
    document.addEventListener("visibilitychange", onVisibilityChange);
    void runCheck();
  }

  return () => {
    listeners.delete(listener);

    if (listeners.size === 0) {
      clearTimer();
      window.removeEventListener("online", onBrowserOnline);
      window.removeEventListener("offline", onBrowserOffline);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      // the last known state is kept on purpose so a remount does not flash
      // "checking" at the cashier
    }
  };
}

// null-free snapshot: "checking" on the server and during hydration, so the
// first client render matches the html.
export function useConnection(): ConnectionState {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => "checking" as ConnectionState,
  );
}

// for event handlers that need the state without subscribing
export function getConnection(): ConnectionState {
  return snapshot;
}

// force a ping now: the "check again" button, and after any request that
// failed on the network so the banner catches up without waiting for the loop
export function checkConnection(): Promise<ConnectionState> {
  return runCheck();
}

// how many local orders still have to reach supabase. phase 4 track b calls
// this from the sync worker; anything above zero shows as "syncing".
export function setPendingSync(count: number) {
  pendingSync = Math.max(0, count);
  publish();
}
