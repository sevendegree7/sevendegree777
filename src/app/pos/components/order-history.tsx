"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { getDataSource } from "@/lib/data";
import { useLocalOrders } from "@/lib/data/use-local-orders";
import { mergeBoard, ticketNumber, type KitchenOrder } from "@/lib/kds/orders";
import { formatMoney } from "@/lib/pos/money";
import { buildReceipt, formatTruckTime } from "@/lib/pos/receipt";
import { startOfTruckDayIso } from "@/lib/reports/dates";
import type { OrderStatus } from "@/types/database.types";

import { ReceiptView } from "./receipt-view";

type OrderHistoryProps = {
  onClose: () => void;
};

// what the cashier is told a ticket is doing right now
const STATUS_STYLE: Record<OrderStatus, string> = {
  pending: "bg-amber-100 text-amber-900",
  preparing: "bg-blue-100 text-blue-900",
  ready: "bg-green-100 text-green-900",
  completed: "bg-stone-100 text-stone-600",
  cancelled: "bg-red-100 text-red-900",
};

// the sales taken today, so the cashier can look one up and print it again.
//
// the list is drawn from both stores, exactly like the kitchen board is: what
// supabase has, plus anything still sitting on this tablet. `mergeBoard` does
// the de-duplicating, so a sale that has been uploaded is shown once and not
// twice - and the same call means the till and the kitchen can never disagree
// about which copy of a sale is the real one.
export function OrderHistory({ onClose }: OrderHistoryProps) {
  const [cloudOrders, setCloudOrders] = useState<KitchenOrder[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [openOrderId, setOpenOrderId] = useState<string | null>(null);

  const localOrders = useLocalOrders();

  // one boundary per open, not per render: a value that moves on every render
  // would restart the read forever
  const since = useMemo(() => startOfTruckDayIso(), []);

  // the react compiler lint bans setState in an effect body, so "loading"
  // starts true and is turned back on by the refresh button - which is an
  // event handler, where setting it is exactly right.
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const result = await getDataSource().loadRecentOrders(since);

      if (cancelled) {
        return;
      }

      setLoading(false);

      if (result.error !== null) {
        setError(result.error);
        setCloudOrders([]);
        return;
      }

      setError(null);
      setCloudOrders(result.data);
    })();

    return () => {
      cancelled = true;
    };
  }, [since, attempt]);

  // newest first. mergeBoard hands back the kitchen's order, which is oldest
  // first, and a cashier looking something up wants the opposite.
  const orders = useMemo(
    () => [...mergeBoard(cloudOrders, localOrders)].reverse(),
    [cloudOrders, localOrders],
  );

  const openOrder = orders.find((order) => order.id === openOrderId) ?? null;

  const close = useCallback(() => {
    setOpenOrderId(null);
  }, []);

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-stone-900/40 p-4">
      <div className="my-auto w-full max-w-lg rounded-2xl bg-white p-5 shadow-lg">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-medium">today&apos;s orders</h2>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setLoading(true);
                setAttempt((count) => count + 1);
              }}
              className="rounded-xl border border-stone-300 px-3 py-2 text-sm"
            >
              refresh
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-stone-300 px-3 py-2 text-sm"
            >
              close
            </button>
          </div>
        </div>

        {error ? (
          <p className="mt-4 rounded-xl bg-red-100 px-4 py-3 text-sm text-red-900">
            {error}
          </p>
        ) : null}

        {loading ? (
          <p className="mt-4 text-sm text-stone-600">loading...</p>
        ) : null}

        {!loading && orders.length === 0 ? (
          <p className="mt-4 text-sm text-stone-600">
            no sales yet today.
          </p>
        ) : null}

        <ul className="mt-4 space-y-2">
          {orders.map((order) => (
            <li key={order.id}>
              <button
                type="button"
                onClick={() => setOpenOrderId(order.id)}
                className="flex w-full items-center justify-between gap-3 rounded-xl border border-stone-200 px-4 py-3 text-left"
              >
                <span className="min-w-0">
                  <span className="block">
                    <span className="font-mono text-base">
                      #{ticketNumber(order.id)}
                    </span>
                    <span className="ml-3 text-sm text-stone-600">
                      {formatTruckTime(order.created_at)}
                    </span>
                  </span>
                  {order.client_id !== null &&
                  localOrders.some(
                    (local) => local.client_id === order.client_id,
                  ) ? (
                    // still only on this tablet. worth saying, because it is
                    // not in the day's takings in supabase yet.
                    <span className="block text-xs text-amber-800">
                      on this tablet
                    </span>
                  ) : null}
                </span>
                <span className="flex shrink-0 items-center gap-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLE[order.status]}`}
                  >
                    {order.status}
                  </span>
                  <span className="whitespace-nowrap text-sm font-medium">
                    {formatMoney(Number(order.total_amount))}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {openOrder ? (
        <ReceiptView
          receipt={buildReceipt(openOrder)}
          reprint
          onClose={close}
        />
      ) : null}
    </div>
  );
}
