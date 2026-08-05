"use client";

import { usePathname } from "next/navigation";
import { useCallback, useSyncExternalStore } from "react";

import {
  DEFAULT_LANGUAGE,
  LANGUAGE_KEY,
  isBilingualPath,
  isLanguage,
  type Language,
} from "@/lib/ui/preferences";

import { translate, type TranslationKey } from "./dictionary";

// the language the till is set to, watchable the same way as the shift and the
// connection. it is stored on the device, so a tablet that opens offline still
// comes up in arabic if that is how it was left.

let language: Language = DEFAULT_LANGUAGE;
let listeners: (() => void)[] = [];
let started = false;

function read(): Language {
  try {
    const stored = window.localStorage.getItem(LANGUAGE_KEY);
    return isLanguage(stored) ? stored : DEFAULT_LANGUAGE;
  } catch {
    return DEFAULT_LANGUAGE;
  }
}

// only the till and the sign in page are bilingual. flipping the whole
// document to rtl would drag the kitchen board and admin along with it, and
// those are still english.
function applyDocument(next: Language): void {
  const root = document.documentElement;
  const bilingual = isBilingualPath(window.location.pathname);

  if (bilingual && next === "ar") {
    root.lang = "ar";
    root.dir = "rtl";
    return;
  }

  root.lang = "en";
  root.dir = "ltr";
}

function apply(): void {
  const next = read();

  applyDocument(next);

  if (next === language) {
    return;
  }

  language = next;

  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void): () => void {
  listeners = [...listeners, listener];

  if (!started) {
    started = true;
    window.addEventListener("storage", apply);
  }

  apply();

  return () => {
    listeners = listeners.filter((entry) => entry !== listener);
  };
}

function getSnapshot(): Language {
  return language;
}

// the server renders english. a tablet set to arabic swaps on hydration, which
// is why the boot script sets dir before anything paints.
function getServerSnapshot(): Language {
  return DEFAULT_LANGUAGE;
}

export function useLanguage(): Language {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function setLanguage(value: Language): void {
  try {
    window.localStorage.setItem(LANGUAGE_KEY, value);
  } catch {
    // storage is off. the choice still holds for this session.
  }

  apply();
}

export type Translator = (
  key: TranslationKey,
  values?: Record<string, string | number>,
) => string;

// the translator, and the rule that keeps arabic where it belongs.
//
// the language is one setting for the whole device, but only the till is
// bilingual so far. the connection banner and the receipt are shared with the
// kitchen board, and without this check a cashier switching to arabic would
// leave arabic strings on an otherwise english screen. widening the language
// later is one edit to isBilingualPath.
export function useTranslate(): {
  t: Translator;
  language: Language;
  isRtl: boolean;
} {
  const stored = useLanguage();
  const pathname = usePathname();

  const current: Language = isBilingualPath(pathname) ? stored : "en";

  const t = useCallback<Translator>(
    (key, values) => translate(current, key, values),
    [current],
  );

  return { t, language: current, isRtl: current === "ar" };
}
