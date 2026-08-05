"use client";

import { useSyncExternalStore } from "react";

import {
  DEFAULT_THEME,
  THEME_KEY,
  isThemePreference,
  type ResolvedTheme,
  type ThemePreference,
} from "./preferences";

// the theme as something a screen can watch.
//
// same one-store-per-tab shape as the connection watcher and the offline
// orders: the till and the kitchen board are two tabs of one browser, and a
// theme change in one should not leave the other on the old one.

let preference: ThemePreference = DEFAULT_THEME;
let resolved: ResolvedTheme = "light";
let listeners: (() => void)[] = [];
let started = false;

function prefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function resolve(value: ThemePreference): ResolvedTheme {
  if (value === "system") {
    return prefersDark() ? "dark" : "light";
  }

  return value;
}

function readPreference(): ThemePreference {
  try {
    const stored = window.localStorage.getItem(THEME_KEY);
    return isThemePreference(stored) ? stored : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

function apply(): void {
  const nextPreference = readPreference();
  const nextResolved = resolve(nextPreference);

  // the boot script already set this on a fresh load. re-applying is what makes
  // a change in the other tab, or the device flipping to night mode, land here.
  document.documentElement.dataset.theme = nextResolved;

  if (nextPreference === preference && nextResolved === resolved) {
    return;
  }

  preference = nextPreference;
  resolved = nextResolved;

  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void): () => void {
  listeners = [...listeners, listener];

  if (!started) {
    started = true;
    // the other tab changed it
    window.addEventListener("storage", apply);
    // the device went into night mode while "system" is selected
    window
      .matchMedia("(prefers-color-scheme: dark)")
      .addEventListener("change", apply);
  }

  apply();

  return () => {
    listeners = listeners.filter((entry) => entry !== listener);
  };
}

function getSnapshot(): ThemePreference {
  return preference;
}

// the server has no device to ask, so it renders the default and the real
// preference arrives on the client
function getServerSnapshot(): ThemePreference {
  return DEFAULT_THEME;
}

export function useThemePreference(): ThemePreference {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function setThemePreference(value: ThemePreference): void {
  try {
    window.localStorage.setItem(THEME_KEY, value);
  } catch {
    // storage is off. the theme still applies for this session.
  }

  apply();
}
