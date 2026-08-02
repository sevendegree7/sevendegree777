"use client";

import type { MenuSnapshot } from "./types";

// the last menu that came back from the server, kept on the device so the
// tablet can still sell with no internet.
//
// localstorage and not indexeddb: the whole menu is a few kilobytes, and a
// synchronous read means the grid can paint without waiting.
const KEY = "seven-degree.menu.v1";

// storage can be full, disabled, or hold something from an older build.
// none of that is worth breaking the till over, so every path fails quietly.
function isSnapshot(value: unknown): value is MenuSnapshot {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<MenuSnapshot>;

  return (
    Array.isArray(candidate.categories) &&
    Array.isArray(candidate.products) &&
    Array.isArray(candidate.modifiers) &&
    typeof candidate.fetchedAt === "string"
  );
}

export function readCachedMenu(): MenuSnapshot | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(KEY);

    if (!raw) {
      return null;
    }

    const parsed: unknown = JSON.parse(raw);

    return isSnapshot(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeCachedMenu(snapshot: MenuSnapshot): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(KEY, JSON.stringify(snapshot));
  } catch {
    // out of space or private mode. the app keeps working online.
  }
}
