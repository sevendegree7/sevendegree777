"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";

import { cancelOrder } from "@/app/pos/actions";
import { getDataSource } from "@/lib/data";
import { useTranslate } from "@/lib/i18n/use-language";
import { useLocalOrders } from "@/lib/data/use-local-orders";
import {
  isKitchenStatus,
  mergeBoard,
  ticketNumber,
  type KitchenOrder,
} from "@/lib/kds/orders";
import { formatMoney } from "@/lib/pos/money";
import { buildReceipt, formatTruckTime } from "@/lib/pos/receipt";
import { startOfTruckDayIso } from "@/lib/reports/dates";
import { useScrollLock } from "@/lib/ui/use-scroll-lock";
import type { OrderStatus } from "@/types/database.types";

import { ReceiptView } from "./receipt-view";

type OrderHistoryProps = {
  onClose: () => void;
  // hands the sale back to the till as a cart. the void of the old ticket
  // happens on the server at checkout, not here.
  onEdit: (order: KitchenOrder) => void;
  // an edit needs the server, because the old ticket lives there
  offline: boolean;
};

// what the cashier is told a ticket is doing right now
const STATUS_STYLE: Record<OrderStatus, string> = {
  pending: "bg-warn/15 text-warn",
  preparing: "bg-info/15 text-info",
  ready: "bg-ok/15 text-ok",
  completed: "bg-sunken text-muted",
  cancelled: "bg-danger/15 text-danger",
};

// the sales taken today, so the cashier can look one up and print it again.
//
// the list is drawn from both stores, exactly like the kitchen board is: what
// supabase has, plus anything still sitting on this tablet. `mergeBoard` does
// the de-duplicating, so a sale that has been uploaded is shown once and not
// twice - and the same call means the till and the kitchen can never disagree
// about which copy of a sale is the real one.
export function OrderHistory({ onClose, onEdit, offline }: OrderHistoryProps) {
  const [cloudOrders, setCloudOrders] = useState<KitchenOrder[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [openOrderId, setOpenOrderId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const localOrders = useLocalOrders();
  const { t } = useTranslate();

  useScrollLock();

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
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-navy/60 p-4">
      <div className="flex max-h-[85dvh] w-full max-w-2xl flex-col overflow-y-auto overscroll-contain rounded-2xl border border-line bg-raised p-5 shadow-xl">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-lg font-semibold">
            {t("history.title")}
          </h2>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setLoading(true);
                setAttempt((count) => count + 1);
              }}
              className="rounded-xl border border-line px-3 py-2 text-sm"
            >
              {t("history.refresh")}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-line px-3 py-2 text-sm"
            >
              {t("history.close")}
            </button>
          </div>
        </div>

        {error ? (
          <p className="mt-4 rounded-xl bg-danger/15 px-4 py-3 text-sm text-danger">
            {error}
          </p>
        ) : null}

        {message ? (
          <p className="mt-4 rounded-xl bg-sunken px-4 py-3 text-sm">
            {message}
          </p>
        ) : null}

        {loading ? (
          <p className="mt-4 text-sm text-muted">{t("history.loading")}</p>
        ) : null}

        {!loading && orders.length === 0 ? (
          <p className="mt-4 text-sm text-muted">{t("history.empty")}</p>
        ) : null}

        <ul className="mt-4 space-y-2">
          {orders.map((order) => {
            // only a ticket still on the kitchen board can be corrected. once
            // it is completed the customer has the food, and once it is
            // cancelled this was already done to it.
            const editable =
              isKitchenStatus(order.status) || order.status === "completed";
            // a sale that has not been uploaded has no server row to void
            const onTabletOnly =
              order.client_id !== null &&
              localOrders.some((local) => local.client_id === order.client_id);

            return (
            <li key={order.id} className="flex items-stretch gap-2">
              <button
                type="button"
                onClick={() => setOpenOrderId(order.id)}
                className="flex flex-1 items-center justify-between gap-3 rounded-xl border border-line px-4 py-3 text-start"
              >
                <span className="min-w-0">
                  <span className="block">
                    <span className="font-mono text-base">
                      #{ticketNumber(order)}
                    </span>
                    <span className="ms-3 font-mono text-sm text-muted">
                      {formatTruckTime(order.created_at)}
                    </span>
                  </span>
                  {onTabletOnly ? (
                    // still only on this tablet. worth saying, because it is
                    // not in the day's takings in supabase yet.
                    <span className="block text-xs text-warn">
                      {t("history.onThisTablet")}
                    </span>
                  ) : null}
                </span>
                <span className="flex shrink-0 items-center gap-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLE[order.status]}`}
                  >
                    {t(`status.${order.status}`)}
                  </span>
                  <span className="whitespace-nowrap font-mono text-sm font-medium">
                    {formatMoney(Number(order.total_amount))}
                  </span>
                </span>
              </button>

              <div className="flex shrink-0 flex-col gap-1">
                {editable ? (
                  <button
                    type="button"
                    disabled={offline || onTabletOnly || pending}
                    title={
                      offline
                        ? t("history.editNeedsInternet")
                        : onTabletOnly
                          ? t("history.notUploaded")
                          : undefined
                    }
                    onClick={() => onEdit(order)}
                    className="rounded-xl border border-line px-3 py-2 text-sm disabled:opacity-40"
                  >
                    {t("history.edit")}
                  </button>
                ) : null}
                {order.status !== "cancelled" ? (
                  <button
                    type="button"
                    disabled={offline || onTabletOnly || pending}
                    onClick={() => {
                      if (
                        !window.confirm(
                          t("history.confirmCancel", {
                            ticket: ticketNumber(order),
                          }),
                        )
                      ) {
                        return;
                      }
                      startTransition(async () => {
                        const result = await cancelOrder(order.id);
                        setMessage(
                          result.ok
                            ? (result.warning ??
                                t("history.cancelled", {
                                  ticket: result.ticket,
                                }))
                            : result.message,
                        );
                        if (result.ok) setAttempt((count) => count + 1);
                      });
                    }}
                    className="rounded-xl border border-danger px-3 py-2 text-sm text-danger disabled:opacity-40"
                  >
                    {t("history.cancel")}
                  </button>
                ) : null}
              </div>
            </li>
            );
          })}
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
