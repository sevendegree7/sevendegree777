"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

import { BrandMark } from "@/components/brand-mark";
import {
  ROLE_OFFLINE_HOME,
  canAccessRoute,
  isUserRole,
} from "@/lib/auth/roles";
import { clearShift, saveShift, useShift } from "@/lib/auth/shift";
import { checkConnection, useConnection } from "@/lib/connection/use-connection";
import { createClient } from "@/lib/supabase/client";

// keeps the tablet's note of who is on shift, and closes the screen when there
// is no note and no internet to make one.
//
// the proxy does this job whenever there is a server to ask. offline there is
// none: the page came out of the service worker cache without touching the
// network, so this is the only thing standing between a tablet somebody picked
// up and a till that takes orders. it is a door, not a lock - the real lock is
// on the server, on every write.
export function ShiftKeeper() {
  const connection = useConnection();
  const pathname = usePathname();
  const shift = useShift();
  const confirmed = useRef(false);

  // ask the server who this is while there is a server to ask
  useEffect(() => {
    if (connection === "checking") {
      return;
    }

    if (connection === "offline") {
      // ask again when the connection comes back: the session may have run
      // out while the truck was parked somewhere with no signal
      confirmed.current = false;
      return;
    }

    if (confirmed.current) {
      return;
    }

    confirmed.current = true;

    let cancelled = false;

    void (async () => {
      const supabase = createClient();
      const { data, error } = await supabase.auth.getUser();

      if (cancelled) {
        return;
      }

      if (error) {
        // the request failed, which says nothing about the session. leave the
        // note alone - dropping it here would shut the tablet out of its own
        // shift over one bad ping - and try again on the next change.
        confirmed.current = false;
        return;
      }

      if (!data.user) {
        // really signed out. the cached till must not open again.
        clearShift();
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("name, role")
        .eq("id", data.user.id)
        .maybeSingle();

      if (cancelled || !profile || !isUserRole(profile.role)) {
        return;
      }

      saveShift({
        userId: data.user.id,
        name: profile.name,
        role: profile.role,
        savedAt: new Date().toISOString(),
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [connection]);

  // the same route rule the proxy applies online. one tablet signed in as
  // admin opens both screens; a cashier tablet does not get the kitchen board
  // just because the internet went away.
  useEffect(() => {
    if (connection !== "offline" || !shift) {
      return;
    }

    if (!canAccessRoute(shift.role, pathname)) {
      // a plain document load, not a client navigation: that one asks the
      // server for a payload which is not coming. the offline home is the
      // screen the tablet is sure to have a copy of.
      window.location.assign(ROLE_OFFLINE_HOME[shift.role]);
    }
  }, [connection, pathname, shift]);

  if (connection !== "offline" || shift) {
    return null;
  }

  // no shift and no way to open one. said on top of the screen rather than by
  // sending them to /login, because that page needs a copy on the tablet and
  // this is exactly the state where there might not be one.
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-surface px-6">
      <div className="w-full max-w-md rounded-2xl border border-line bg-raised p-8 text-center shadow-sm">
        <BrandMark size="lg" className="mx-auto" />
        <p className="mt-2 font-mono text-[0.65rem] uppercase tracking-[0.2em] text-muted">
          Seven Degrees
        </p>
        <h1 className="font-display mt-3 text-3xl font-semibold text-ink">
          No shift on this tablet
        </h1>
        <p className="mt-3 text-sm text-muted">
          Nobody is signed in here, and signing in needs the internet. Connect
          once and sign in. After that this screen opens on its own, internet or
          not.
        </p>
        <button
          type="button"
          onClick={() => void checkConnection()}
          className="mt-6 w-full rounded-xl border border-line px-4 py-3 text-base"
        >
          Check again
        </button>
      </div>
    </div>
  );
}
