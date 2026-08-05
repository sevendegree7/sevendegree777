"use client";

import type { ReactNode } from "react";

import type { KitchenStatus } from "@/lib/kds/orders";

type StatusColumnProps = {
  status: KitchenStatus;
  count: number;
  children: ReactNode;
};

// heading + colour per lane so the kitchen reads the board at a glance
const COLUMN_LABEL: Record<KitchenStatus, string> = {
  pending: "New",
  preparing: "Preparing",
  ready: "Ready",
};

const COLUMN_ACCENT: Record<KitchenStatus, string> = {
  pending: "bg-warn/15 text-warn",
  preparing: "bg-info/15 text-info",
  ready: "bg-ok/15 text-ok",
};

const EMPTY_TEXT: Record<KitchenStatus, string> = {
  pending: "No new orders.",
  preparing: "Nothing on the pass.",
  ready: "Nothing waiting for pickup.",
};

// one lane of the kitchen board
export function StatusColumn({ status, count, children }: StatusColumnProps) {
  return (
    <section className="flex flex-col gap-3">
      <div
        className={`flex items-center justify-between rounded-xl px-4 py-3 ${COLUMN_ACCENT[status]}`}
      >
        <h2 className="text-lg font-semibold">{COLUMN_LABEL[status]}</h2>
        <span className="text-lg font-semibold">{count}</span>
      </div>

      {count === 0 ? (
        <p className="rounded-2xl bg-raised p-5 text-sm text-muted shadow-sm">
          {EMPTY_TEXT[status]}
        </p>
      ) : (
        <div className="flex flex-col gap-3">{children}</div>
      )}
    </section>
  );
}
