"use client";

import { useState } from "react";

import {
  NEXT_STATUS,
  NEXT_STATUS_LABEL,
  PREVIOUS_STATUS,
  minutesSince,
  ticketNumber,
  type KitchenOrder,
  type KitchenStatus,
} from "@/lib/kds/orders";
import type { OrderStatus } from "@/types/database.types";

type OrderCardProps = {
  order: KitchenOrder;
  status: KitchenStatus;
  // shared clock, null until the browser mounts so ssr and hydration match
  now: number | null;
  busy: boolean;
  // true while the lines are still being fetched for a brand new ticket
  waitingForItems: boolean;
  // taken with no internet: this ticket exists on this tablet and nowhere else
  local: boolean;
  onMove: (to: OrderStatus) => void;
  onReload: () => void;
};

// a ticket sitting too long turns red so the kitchen notices it
const LATE_MINUTES = 10;

const ORDER_TYPE_LABEL: Record<string, string> = {
  takeaway: "takeaway",
  dine_in: "dine in",
  talabat: "talabat",
};

// one kitchen ticket: what to make, the extras, and the button to move it on
export function OrderCard({
  order,
  status,
  now,
  busy,
  waitingForItems,
  local,
  onMove,
  onReload,
}: OrderCardProps) {
  const waited = now === null ? null : minutesSince(order.created_at, now);
  const late = waited !== null && waited >= LATE_MINUTES;
  const previous = PREVIOUS_STATUS[status];
  const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0);

  // voiding is the one move on this card that cannot be undone, so it asks
  // first. two taps on the card itself and not a dialog over the board: the
  // kitchen has flour on its hands and a modal that covers the other tickets
  // is worse than the mis-tap it prevents.
  const [confirmingVoid, setConfirmingVoid] = useState(false);

  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
      <header className="flex items-start justify-between gap-2">
        <div>
          <p className="text-lg font-semibold text-stone-900">
            #{ticketNumber(order.id)}
          </p>
          <p className="text-sm text-stone-500">
            {ORDER_TYPE_LABEL[order.order_type] ?? order.order_type}
            {itemCount > 0
              ? ` · ${itemCount} ${itemCount === 1 ? "item" : "items"}`
              : ""}
          </p>

          {local ? (
            <p className="mt-1 inline-block rounded-lg bg-amber-100 px-2 py-1 text-sm font-medium text-amber-900">
              on this tablet only
            </p>
          ) : null}
        </div>
        <span
          className={`rounded-lg px-2 py-1 text-sm font-medium ${
            late ? "bg-red-100 text-red-900" : "bg-stone-100 text-stone-700"
          }`}
        >
          {waited === null ? "· ·" : `${waited} min`}
        </span>
      </header>

      {order.items.length === 0 ? (
        <div className="rounded-xl bg-stone-50 px-3 py-4 text-sm text-stone-500">
          {waitingForItems ? (
            "loading items..."
          ) : (
            <span className="flex flex-wrap items-center gap-2">
              no items came through yet.
              <button
                type="button"
                onClick={onReload}
                className="rounded-lg border border-stone-300 px-3 py-1 text-stone-700"
              >
                reload
              </button>
            </span>
          )}
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {order.items.map((item) => (
            <li key={item.id} className="rounded-xl bg-stone-50 p-3">
              <p className="text-base font-medium text-stone-900">
                <span className="mr-2 text-lg font-semibold">
                  {item.quantity}×
                </span>
                {item.product_name}
              </p>

              {item.selected_modifiers.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1">
                  {item.selected_modifiers.map((modifier) => (
                    <span
                      key={modifier.id}
                      className="rounded-lg bg-amber-100 px-2 py-1 text-sm font-medium text-amber-900"
                    >
                      {modifier.name}
                    </span>
                  ))}
                </div>
              ) : null}

              {item.notes ? (
                <p className="mt-2 rounded-lg bg-blue-50 px-2 py-1 text-sm font-medium text-blue-900">
                  {item.notes}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {order.notes ? (
        <p className="rounded-xl bg-blue-50 px-3 py-2 text-sm font-medium text-blue-900">
          order note: {order.notes}
        </p>
      ) : null}

      {confirmingVoid ? (
        <div className="flex flex-col gap-2 rounded-xl bg-red-50 p-3">
          <p className="text-sm font-medium text-red-900">
            {local
              ? "void this ticket? this sale is only on this tablet, so it goes away for good."
              : "void this ticket? the ingredients go back on the shelf."}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setConfirmingVoid(false)}
              className="flex-1 rounded-xl border border-stone-300 bg-white px-4 py-4 text-base text-stone-700"
            >
              keep it
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirmingVoid(false);
                onMove("cancelled");
              }}
              disabled={busy}
              className="flex-1 rounded-xl bg-red-700 px-4 py-4 text-base font-medium text-white disabled:opacity-50"
            >
              void #{ticketNumber(order.id)}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex gap-2">
            {previous ? (
              <button
                type="button"
                onClick={() => onMove(previous)}
                disabled={busy}
                className="rounded-xl border border-stone-300 px-4 py-4 text-base text-stone-600 disabled:opacity-50"
              >
                undo
              </button>
            ) : null}

            <button
              type="button"
              onClick={() => onMove(NEXT_STATUS[status])}
              disabled={busy}
              className="flex-1 rounded-xl bg-stone-900 px-4 py-4 text-lg font-medium text-white disabled:opacity-50"
            >
              {busy ? "saving..." : NEXT_STATUS_LABEL[status]}
            </button>
          </div>

          {/* kept small, quiet and on its own line. the row above is tapped all
              day with the side of a thumb, and this one does not come back. */}
          <button
            type="button"
            onClick={() => setConfirmingVoid(true)}
            disabled={busy}
            className="self-start rounded-lg px-2 py-1 text-sm text-stone-400 underline underline-offset-4 disabled:opacity-50"
          >
            void
          </button>
        </>
      )}
    </article>
  );
}
