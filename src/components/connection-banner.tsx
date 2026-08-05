"use client";

import {
  checkConnection,
  useConnection,
  type ConnectionState,
} from "@/lib/connection/use-connection";
import type { TranslationKey } from "@/lib/i18n/dictionary";
import { useTranslate } from "@/lib/i18n/use-language";

const STYLE: Record<ConnectionState, string> = {
  checking: "bg-sunken text-muted",
  online: "bg-ok/15 text-ok",
  offline: "bg-danger/15 text-danger",
  syncing: "bg-warn/15 text-warn",
};

const LABEL: Record<ConnectionState, TranslationKey> = {
  checking: "connection.checking",
  online: "connection.online",
  offline: "connection.offline",
  syncing: "connection.syncing",
};

// the shift status strip for /pos and /kds. says whether this device can
// actually reach supabase right now, not just whether wifi has bars.
export function ConnectionBanner() {
  const state = useConnection();
  const { t } = useTranslate();

  return (
    <span
      className={`inline-flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium ${STYLE[state]}`}
    >
      {t(LABEL[state])}

      {state === "offline" ? (
        <button
          type="button"
          onClick={() => void checkConnection()}
          className="rounded-md border border-danger px-2 py-1 text-xs"
        >
          {t("connection.checkAgain")}
        </button>
      ) : null}
    </span>
  );
}
