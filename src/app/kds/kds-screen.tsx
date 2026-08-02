"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ConnectionBanner } from "@/components/connection-banner";
import { checkConnection } from "@/lib/connection/use-connection";
import {
  KITCHEN_STATUSES,
  isKitchenStatus,
  sortByOldest,
  type KitchenOrder,
  type KitchenStatus,
} from "@/lib/kds/orders";
import { fetchKitchenOrder, fetchKitchenOrders } from "@/lib/kds/queries";
import { useNow } from "@/lib/kds/use-now";
import { createClient } from "@/lib/supabase/client";
import type { Order, OrderStatus } from "@/types/database.types";

import { moveOrderStatus } from "./actions";
import { OrderCard } from "./components/order-card";
import { StatusColumn } from "./components/status-column";

type KdsScreenProps = {
  initialOrders: KitchenOrder[];
};

type Connection = "connecting" | "live" | "offline";

// what one read of a ticket told us
type SyncOutcome = "items" | "empty" | "gone" | "error";

// an order row can arrive over realtime before its lines are written, so a
// ticket with zero items is re-read a few times before we believe it.
const ITEM_RETRIES = 5;
const ITEM_RETRY_BASE_MS = 400;
const ITEM_RETRY_MAX_MS = 3000;

const CONNECTION_STYLE: Record<Connection, string> = {
  connecting: "bg-stone-100 text-stone-700",
  live: "bg-green-100 text-green-900",
  offline: "bg-red-100 text-red-900",
};

// says whether the realtime socket is up, next to the banner that says whether
// the internet is up at all. the words stay apart so they cannot be misread.
const CONNECTION_LABEL: Record<Connection, string> = {
  connecting: "realtime connecting...",
  live: "realtime live",
  offline: "realtime off - tap refresh",
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// a dropped connection comes back as a raw "TypeError: Failed to fetch",
// which tells the kitchen nothing. swap it for something they can act on.
function readableError(message: string): string {
  return /failed to fetch|networkerror|load failed/i.test(message)
    ? "lost the connection to the server. tap refresh."
    : message;
}

// the kitchen board. holds every open ticket and keeps it in sync with
// supabase realtime, no polling.
export function KdsScreen({ initialOrders }: KdsScreenProps) {
  const supabase = useMemo(() => createClient(), []);

  const [orders, setOrders] = useState<KitchenOrder[]>(() =>
    sortByOldest(initialOrders),
  );
  const [connection, setConnection] = useState<Connection>("connecting");
  const [busyIds, setBusyIds] = useState<string[]>([]);
  const [waitingIds, setWaitingIds] = useState<string[]>([]);
  const [errorText, setErrorText] = useState<string | null>(null);

  const now = useNow();

  const mounted = useRef(true);
  // ids that already have a retry loop running, so events do not stack them
  const retrying = useRef(new Set<string>());

  useEffect(() => {
    mounted.current = true;

    return () => {
      mounted.current = false;
    };
  }, []);

  const dropOrder = useCallback((orderId: string) => {
    setOrders((current) => current.filter((order) => order.id !== orderId));
  }, []);

  // read one ticket fresh from the db and put it on the board
  const applyOrder = useCallback(
    async (orderId: string): Promise<SyncOutcome> => {
      const { order, error } = await fetchKitchenOrder(supabase, orderId);

      if (!mounted.current) {
        return "error";
      }

      if (error) {
        setErrorText(readableError(error));
        return "error";
      }

      // off the board: completed, cancelled or gone
      if (!order || !isKitchenStatus(order.status)) {
        dropOrder(orderId);
        return "gone";
      }

      setOrders((current) => {
        const existing = current.find((row) => row.id === orderId);
        // keep the lines we already have if this read came back empty
        const items =
          order.items.length > 0 ? order.items : (existing?.items ?? []);
        const merged: KitchenOrder = { ...order, items };

        return sortByOldest(
          existing
            ? current.map((row) => (row.id === orderId ? merged : row))
            : [...current, merged],
        );
      });

      return order.items.length > 0 ? "items" : "empty";
    },
    [supabase, dropOrder],
  );

  // read a ticket, then keep re-reading while it still has no lines.
  // zero items means "not written yet", not "an empty order".
  const syncOrder = useCallback(
    async (orderId: string) => {
      if ((await applyOrder(orderId)) !== "empty") {
        return;
      }

      if (retrying.current.has(orderId)) {
        return;
      }

      retrying.current.add(orderId);
      setWaitingIds((current) =>
        current.includes(orderId) ? current : [...current, orderId],
      );

      try {
        for (let attempt = 0; attempt < ITEM_RETRIES; attempt += 1) {
          await sleep(
            Math.min(ITEM_RETRY_BASE_MS * 2 ** attempt, ITEM_RETRY_MAX_MS),
          );

          if (!mounted.current) {
            return;
          }

          if ((await applyOrder(orderId)) !== "empty") {
            return;
          }
        }
      } finally {
        retrying.current.delete(orderId);

        if (mounted.current) {
          setWaitingIds((current) => current.filter((id) => id !== orderId));
        }
      }
    },
    [applyOrder],
  );

  // full refetch, used on first subscribe and after any gap in the connection
  const reloadAll = useCallback(async () => {
    const { orders: fresh, error } = await fetchKitchenOrders(supabase);

    if (!mounted.current) {
      return;
    }

    if (error) {
      setErrorText(readableError(error));
      return;
    }

    setErrorText(null);
    setOrders(sortByOldest(fresh));
  }, [supabase]);

  // realtime: orders only. order_items is not in the publication, so an event
  // only tells us which ticket to re-read.
  useEffect(() => {
    const channel = supabase
      .channel("kds-orders")
      .on<Order>(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const removedId = payload.old?.id;

            if (removedId) {
              dropOrder(removedId);
            }

            return;
          }

          void syncOrder(payload.new.id);
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setConnection("live");
          // catch anything that changed while we were not listening
          void reloadAll();
          return;
        }

        if (status === "CLOSED") {
          setConnection("connecting");
          return;
        }

        setConnection("offline");
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, syncOrder, reloadAll, dropOrder]);

  // a tablet that sleeps can lose the socket silently, so re-read on wake
  useEffect(() => {
    function onVisibilityChange() {
      if (document.visibilityState === "visible") {
        void reloadAll();
      }
    }

    document.addEventListener("visibilitychange", onVisibilityChange);

    return () =>
      document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [reloadAll]);

  function moveOrder(order: KitchenOrder, to: OrderStatus) {
    setErrorText(null);
    setBusyIds((current) => [...current, order.id]);

    void moveOrderStatus({ orderId: order.id, from: order.status, to })
      .then((result) => {
        if (!mounted.current) {
          return;
        }

        if (!result.ok) {
          setErrorText(result.message);
          return;
        }

        // apply straight away, the realtime event confirms it a moment later
        const status = result.status;

        if (isKitchenStatus(status)) {
          setOrders((current) =>
            current.map((row) =>
              row.id === order.id ? { ...row, status } : row,
            ),
          );
        } else {
          dropOrder(order.id);
        }
      })
      .catch(() => {
        // ask the banner to re-check now instead of waiting for its next ping
        void checkConnection();

        if (mounted.current) {
          setErrorText("could not reach the server. try again.");
        }
      })
      .finally(() => {
        if (mounted.current) {
          setBusyIds((current) => current.filter((id) => id !== order.id));
        }
      });
  }

  const byStatus = useMemo(() => {
    const grouped = new Map<KitchenStatus, KitchenOrder[]>(
      KITCHEN_STATUSES.map((status) => [status, [] as KitchenOrder[]]),
    );

    for (const order of orders) {
      if (isKitchenStatus(order.status)) {
        grouped.get(order.status)?.push(order);
      }
    }

    return grouped;
  }, [orders]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <ConnectionBanner />
          <span
            className={`rounded-lg px-3 py-2 text-sm font-medium ${CONNECTION_STYLE[connection]}`}
          >
            {CONNECTION_LABEL[connection]}
          </span>
        </div>

        <button
          type="button"
          onClick={() => void reloadAll()}
          className="rounded-xl border border-stone-300 px-4 py-2 text-sm text-stone-700"
        >
          refresh
        </button>
      </div>

      {errorText ? (
        <p className="rounded-xl bg-red-100 px-4 py-3 text-sm text-red-900">
          {errorText}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3 lg:items-start">
        {KITCHEN_STATUSES.map((status) => {
          const columnOrders = byStatus.get(status) ?? [];

          return (
            <StatusColumn
              key={status}
              status={status}
              count={columnOrders.length}
            >
              {columnOrders.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  status={status}
                  now={now}
                  busy={busyIds.includes(order.id)}
                  waitingForItems={waitingIds.includes(order.id)}
                  onMove={(to) => moveOrder(order, to)}
                  onReload={() => void syncOrder(order.id)}
                />
              ))}
            </StatusColumn>
          );
        })}
      </div>
    </div>
  );
}
