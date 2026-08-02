"use client";

import { useEffect, useRef } from "react";

import {
  useConnection,
  type ConnectionState,
} from "@/lib/connection/use-connection";
import { syncPendingOrders } from "@/lib/data/sync";

// starts the sync worker when the connection comes back.
//
// no timer of its own: a sale only ever lands on the tablet while there is no
// internet, so "the connection just returned" is the one moment worth acting
// on. the till also has an upload button for the cashier who does not want to
// wait, and every screen that mounts with a live connection runs it once.
export function OfflineSync() {
  const connection = useConnection();
  const previous = useRef<ConnectionState | null>(null);

  useEffect(() => {
    const before = previous.current;
    previous.current = connection;

    // "checking" is the first second after the app opens, "offline" has
    // nowhere to send anything, and a run that just finished lands back on
    // "online" from "syncing" - which is not a reason to start another.
    if (connection !== "online" || before === "syncing") {
      return;
    }

    void syncPendingOrders();
  }, [connection]);

  return null;
}
