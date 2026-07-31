"use client";

import { useSyncExternalStore } from "react";

// one shared clock for the waiting time on every ticket, so the board does
// not run a timer per card.
const TICK_MS = 15000;

let cachedNow = Date.now();
let timer: ReturnType<typeof setInterval> | null = null;

const listeners = new Set<() => void>();

function tick() {
  cachedNow = Date.now();

  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // refresh once on mount, react re-reads the snapshot right after subscribing
  cachedNow = Date.now();

  if (timer === null) {
    timer = setInterval(tick, TICK_MS);
  }

  return () => {
    listeners.delete(listener);

    if (listeners.size === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };
}

// null on the server and during hydration, a timestamp once mounted.
// cards render a placeholder while it is null so the html never mismatches.
export function useNow(): number | null {
  return useSyncExternalStore(
    subscribe,
    () => cachedNow,
    () => null,
  );
}
