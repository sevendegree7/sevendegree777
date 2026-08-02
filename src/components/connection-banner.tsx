"use client";

import {
  checkConnection,
  useConnection,
  type ConnectionState,
} from "@/lib/connection/use-connection";

const STYLE: Record<ConnectionState, string> = {
  checking: "bg-stone-100 text-stone-700",
  online: "bg-green-100 text-green-900",
  offline: "bg-red-100 text-red-900",
  syncing: "bg-amber-100 text-amber-900",
};

const LABEL: Record<ConnectionState, string> = {
  checking: "checking connection...",
  online: "online",
  offline: "offline - no internet",
  syncing: "syncing orders...",
};

// the shift status strip for /pos and /kds. says whether this device can
// actually reach supabase right now, not just whether wifi has bars.
export function ConnectionBanner() {
  const state = useConnection();

  return (
    <span
      className={`inline-flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium ${STYLE[state]}`}
    >
      {LABEL[state]}

      {state === "offline" ? (
        <button
          type="button"
          onClick={() => void checkConnection()}
          className="rounded-md border border-red-300 px-2 py-1 text-xs"
        >
          check again
        </button>
      ) : null}
    </span>
  );
}
