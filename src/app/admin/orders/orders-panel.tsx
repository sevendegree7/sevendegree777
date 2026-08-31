"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import {
  cancelAdminOrders,
  purgeAllOrders,
} from "@/app/admin/actions";
import { ReceiptView } from "@/app/pos/components/receipt-view";
import { ticketNumber, type KitchenOrder } from "@/lib/kds/orders";
import { formatMoney } from "@/lib/pos/money";
import { buildReceipt, formatTruckTime } from "@/lib/pos/receipt";
import type { OrderStatus } from "@/types/database.types";

const STATUS_STYLE: Record<OrderStatus, string> = {
  pending: "bg-warn/15 text-warn",
  preparing: "bg-info/15 text-info",
  ready: "bg-ok/15 text-ok",
  completed: "bg-sunken text-muted",
  cancelled: "bg-danger/15 text-danger",
};

type OrdersPanelProps = {
  orders: KitchenOrder[];
};

export function OrdersPanel({ orders }: OrdersPanelProps) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<string | null>(null);
  const [purgeText, setPurgeText] = useState("");
  const [receiptOrder, setReceiptOrder] = useState<KitchenOrder | null>(null);
  const [pending, startTransition] = useTransition();

  const liveIds = useMemo(
    () => orders.filter((order) => order.status !== "cancelled").map((o) => o.id),
    [orders],
  );

  const allLiveSelected =
    liveIds.length > 0 && liveIds.every((id) => selected.has(id));

  function toggleOne(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllLive() {
    if (allLiveSelected) {
      setSelected(new Set());
      return;
    }
    setSelected(new Set(liveIds));
  }

  function refresh() {
    router.refresh();
    setSelected(new Set());
  }

  return (
    <div className="space-y-6">
      {message ? (
        <p className="rounded-2xl bg-sunken px-4 py-3 text-sm">{message}</p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={pending || selected.size === 0}
          onClick={() => {
            if (
              !window.confirm(
                `Cancel ${selected.size} selected ticket${selected.size === 1 ? "" : "s"}? Stock goes back where possible.`,
              )
            ) {
              return;
            }
            startTransition(async () => {
              const result = await cancelAdminOrders([...selected]);
              setMessage(
                result.ok
                  ? (result.message ?? "done")
                  : result.message,
              );
              if (result.ok) refresh();
            });
          }}
          className="rounded-xl border border-danger px-4 py-2.5 text-sm text-danger disabled:opacity-40"
        >
          Cancel selected ({selected.size})
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={refresh}
          className="rounded-xl border border-line px-4 py-2.5 text-sm"
        >
          Refresh
        </button>
      </div>

      {orders.length === 0 ? (
        <p className="rounded-2xl border border-line bg-raised p-6 text-sm text-muted">
          No orders in this range.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line bg-raised">
          <table className="w-full min-w-[52rem] text-sm">
            <thead>
              <tr className="border-b border-line text-start text-muted">
                <th className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={allLiveSelected}
                    disabled={liveIds.length === 0 || pending}
                    onChange={toggleAllLive}
                    aria-label="Select all live tickets"
                  />
                </th>
                <th className="px-4 py-3 font-medium">Ticket</th>
                <th className="px-4 py-3 font-medium">When</th>
                <th className="px-4 py-3 font-medium">Cashier</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Payment</th>
                <th className="px-4 py-3 font-medium text-end">Total</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => {
                const live = order.status !== "cancelled";
                return (
                  <tr key={order.id} className="border-b border-line/70">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selected.has(order.id)}
                        disabled={!live || pending}
                        onChange={() => toggleOne(order.id)}
                        aria-label={`Select ticket ${ticketNumber(order)}`}
                      />
                    </td>
                    <td className="px-4 py-3 font-mono">#{ticketNumber(order)}</td>
                    <td className="px-4 py-3 font-mono text-muted">
                      {formatTruckTime(order.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      {order.created_by_name ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs capitalize ${STATUS_STYLE[order.status]}`}
                      >
                        {order.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 capitalize">
                      {order.payment_method ?? "—"}
                      {order.is_diyafa ? " · diyafa" : null}
                    </td>
                    <td className="px-4 py-3 text-end font-mono font-medium">
                      {formatMoney(Number(order.total_amount))}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setReceiptOrder(order)}
                          className="rounded-lg border border-line px-2.5 py-1.5 text-xs"
                        >
                          Receipt
                        </button>
                        {live ? (
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => {
                              if (
                                !window.confirm(
                                  `Cancel ticket #${ticketNumber(order)}?`,
                                )
                              ) {
                                return;
                              }
                              startTransition(async () => {
                                const result = await cancelAdminOrders([
                                  order.id,
                                ]);
                                setMessage(
                                  result.ok
                                    ? (result.message ?? "cancelled")
                                    : result.message,
                                );
                                if (result.ok) refresh();
                              });
                            }}
                            className="rounded-lg border border-danger px-2.5 py-1.5 text-xs text-danger disabled:opacity-40"
                          >
                            Cancel
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <section className="rounded-2xl border border-danger/40 bg-danger/5 p-5">
        <h2 className="font-display text-lg font-semibold text-danger">
          Clear all orders (test data)
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Removes every order from the database after putting stock back. Use
          once before go-live to wipe practice sales. Ticket numbers reset for
          today. This cannot be undone.
        </p>
        <div className="mt-4 flex max-w-xl flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex flex-1 flex-col gap-1 text-sm">
            <span className="text-muted">
              Type <span className="font-mono text-ink">DELETE ALL ORDERS</span>
            </span>
            <input
              type="text"
              value={purgeText}
              onChange={(event) => setPurgeText(event.target.value)}
              className="rounded-xl border border-line bg-surface px-3 py-2 font-mono text-sm"
              autoComplete="off"
              disabled={pending}
            />
          </label>
          <button
            type="button"
            disabled={pending || purgeText.trim() !== "DELETE ALL ORDERS"}
            onClick={() => {
              if (
                !window.confirm(
                  "Delete every order permanently? Stock is restored first, but the sales history is gone forever.",
                )
              ) {
                return;
              }
              startTransition(async () => {
                const result = await purgeAllOrders(purgeText);
                setMessage(
                  result.ok ? (result.message ?? "cleared") : result.message,
                );
                if (result.ok) {
                  setPurgeText("");
                  refresh();
                }
              });
            }}
            className="rounded-xl bg-danger px-4 py-2.5 text-sm font-medium text-white disabled:opacity-40"
          >
            Delete all orders
          </button>
        </div>
      </section>

      {receiptOrder ? (
        <ReceiptView
          receipt={buildReceipt(receiptOrder)}
          reprint
          copies={1}
          onClose={() => setReceiptOrder(null)}
        />
      ) : null}
    </div>
  );
}
