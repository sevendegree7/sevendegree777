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
  takeaway: "Takeaway",
  dine_in: "Dine in",
  talabat: "Talabat",
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
    <article className="flex flex-col gap-3 rounded-2xl border border-line bg-raised p-4 shadow-sm">
      <header className="flex items-start justify-between gap-2">
        <div>
          <p className="text-lg font-semibold text-ink">
            #{ticketNumber(order)}
          </p>
          <p className="text-sm text-muted">
            {ORDER_TYPE_LABEL[order.order_type] ?? order.order_type}
            {itemCount > 0
              ? ` · ${itemCount} ${itemCount === 1 ? "item" : "items"}`
              : ""}
          </p>

          {local ? (
            <p className="mt-1 inline-block rounded-lg bg-warn/15 px-2 py-1 text-sm font-medium text-warn">
              On this tablet only
            </p>
          ) : null}
        </div>
        <span
          className={`rounded-lg px-2 py-1 text-sm font-medium ${
            late ? "bg-danger/15 text-danger" : "bg-sunken text-muted"
          }`}
        >
          {waited === null ? "..." : `${waited} min`}
        </span>
      </header>

      {order.items.length === 0 ? (
        <div className="rounded-xl bg-sunken px-3 py-4 text-sm text-muted">
          {waitingForItems ? (
            "Loading items..."
          ) : (
            <span className="flex flex-wrap items-center gap-2">
              No items came through yet.
              <button
                type="button"
                onClick={onReload}
                className="rounded-lg border border-line px-3 py-1 text-muted"
              >
                Reload
              </button>
            </span>
          )}
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {order.items.map((item) => (
            <li key={item.id} className="rounded-xl bg-sunken p-3">
              <p className="text-base font-medium text-ink">
                <span className="mr-2 text-lg font-semibold">
                  {item.quantity}×
                </span>
                {item.product_name}
              </p>

              {item.box_contents && item.box_contents.length > 0 ? (
                <p className="mt-2 text-sm text-muted">
                  {item.box_contents
                    .map((piece) => `${piece.quantity}× ${piece.name}`)
                    .join(", ")}
                </p>
              ) : null}

              {item.selected_modifiers.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1">
                  {item.selected_modifiers.map((modifier) => (
                    <span
                      key={modifier.id}
                      className="rounded-lg bg-warn/15 px-2 py-1 text-sm font-medium text-warn"
                    >
                      {modifier.name}
                    </span>
                  ))}
                </div>
              ) : null}

              {item.notes ? (
                <p className="mt-2 rounded-lg bg-info/10 px-2 py-1 text-sm font-medium text-info">
                  {item.notes}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {order.notes ? (
        <p className="rounded-xl bg-info/10 px-3 py-2 text-sm font-medium text-info">
          Order note: {order.notes}
        </p>
      ) : null}

      {confirmingVoid ? (
        <div className="flex flex-col gap-2 rounded-xl bg-danger/10 p-3">
          <p className="text-sm font-medium text-danger">
            {local
              ? "Void this ticket? This sale is only on this tablet, so it goes away for good."
              : "Void this ticket? The ingredients go back on the shelf."}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setConfirmingVoid(false)}
              className="flex-1 rounded-xl border border-line bg-raised px-4 py-4 text-base text-muted"
            >
              Keep it
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirmingVoid(false);
                onMove("cancelled");
              }}
              disabled={busy}
              className="flex-1 rounded-xl bg-danger px-4 py-4 text-base font-medium text-cream disabled:opacity-50"
            >
              Void #{ticketNumber(order)}
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
                className="rounded-xl border border-line px-4 py-4 text-base text-muted disabled:opacity-50"
              >
                Undo
              </button>
            ) : null}

            <button
              type="button"
              onClick={() => onMove(NEXT_STATUS[status])}
              disabled={busy}
              className="flex-1 rounded-xl bg-navy dark:bg-accent-surface dark:text-accent-ink px-4 py-4 text-lg font-medium text-cream disabled:opacity-50"
            >
              {busy ? "Saving..." : NEXT_STATUS_LABEL[status]}
            </button>
          </div>

          {/* kept small, quiet and on its own line. the row above is tapped all
              day with the side of a thumb, and this one does not come back. */}
          <button
            type="button"
            onClick={() => setConfirmingVoid(true)}
            disabled={busy}
            className="self-start rounded-lg px-2 py-1 text-sm text-muted underline underline-offset-4 disabled:opacity-50"
          >
            Void
          </button>
        </>
      )}
    </article>
  );
}
