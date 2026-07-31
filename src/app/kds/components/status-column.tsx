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
  pending: "new",
  preparing: "preparing",
  ready: "ready",
};

const COLUMN_ACCENT: Record<KitchenStatus, string> = {
  pending: "bg-amber-100 text-amber-900",
  preparing: "bg-blue-100 text-blue-900",
  ready: "bg-green-100 text-green-900",
};

const EMPTY_TEXT: Record<KitchenStatus, string> = {
  pending: "no new orders.",
  preparing: "nothing on the pass.",
  ready: "nothing waiting for pickup.",
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
        <p className="rounded-2xl bg-white p-5 text-sm text-stone-500 shadow-sm">
          {EMPTY_TEXT[status]}
        </p>
      ) : (
        <div className="flex flex-col gap-3">{children}</div>
      )}
    </section>
  );
}
