"use client";

import { formatMoney } from "@/lib/pos/money";
import type { OrderType, PaymentMethod } from "@/types/database.types";

type ConfirmDialogProps = {
  itemCount: number;
  total: number;
  orderType: OrderType;
  paymentMethod: PaymentMethod;
  submitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

// last check before money is taken and the ticket goes to the kitchen
export function ConfirmDialog({
  itemCount,
  total,
  orderType,
  paymentMethod,
  submitting,
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-lg">
        <p className="text-sm text-stone-500">confirm payment</p>
        <p className="mt-2 text-4xl font-semibold text-stone-900">
          {formatMoney(total)}
        </p>

        <dl className="mt-5 space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-stone-600">items</dt>
            <dd className="text-stone-900">{itemCount}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-stone-600">order type</dt>
            <dd className="text-stone-900">{orderType.replace("_", " ")}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-stone-600">payment</dt>
            <dd className="text-stone-900">{paymentMethod}</dd>
          </div>
        </dl>

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="flex-1 rounded-xl border border-stone-300 px-4 py-3 text-base disabled:opacity-50"
          >
            back
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={submitting}
            className="flex-[2] rounded-xl bg-stone-900 px-4 py-3 text-base font-medium text-white disabled:opacity-50"
          >
            {submitting ? "sending..." : "confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}
