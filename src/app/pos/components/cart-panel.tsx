"use client";

import { cartTotal, lineTotal, type CartLine } from "@/lib/pos/cart";
import { formatMoney } from "@/lib/pos/money";
import type { OrderType, PaymentMethod } from "@/types/database.types";

import { OrderTypeSelect } from "./order-type-select";
import { PaymentSelect } from "./payment-select";

type CartPanelProps = {
  lines: CartLine[];
  orderType: OrderType;
  paymentMethod: PaymentMethod;
  orderNotes: string;
  submitting: boolean;
  // no internet: card and instapay cannot be taken
  offline: boolean;
  // offline and the cashier still has card or instapay selected
  paymentBlocked: boolean;
  onChangeQuantity: (lineId: string, quantity: number) => void;
  onRemove: (lineId: string) => void;
  onClear: () => void;
  onOrderTypeChange: (value: OrderType) => void;
  onPaymentMethodChange: (value: PaymentMethod) => void;
  onOrderNotesChange: (value: string) => void;
  onCheckout: () => void;
};

// right hand ticket: lines, totals and the pay button
export function CartPanel({
  lines,
  orderType,
  paymentMethod,
  orderNotes,
  submitting,
  offline,
  paymentBlocked,
  onChangeQuantity,
  onRemove,
  onClear,
  onOrderTypeChange,
  onPaymentMethodChange,
  onOrderNotesChange,
  onCheckout,
}: CartPanelProps) {
  const total = cartTotal(lines);
  const itemCount = lines.reduce((sum, line) => sum + line.quantity, 0);

  return (
    <aside className="flex flex-col gap-4 rounded-2xl bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-stone-900">
          cart{itemCount > 0 ? ` · ${itemCount}` : ""}
        </h2>
        {lines.length > 0 ? (
          <button
            type="button"
            onClick={onClear}
            className="text-sm text-stone-500 underline"
          >
            clear
          </button>
        ) : null}
      </div>

      {lines.length === 0 ? (
        <p className="py-6 text-sm text-stone-500">
          tap a product to start an order.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {lines.map((line) => (
            <li
              key={line.lineId}
              className="rounded-xl border border-stone-200 p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-base font-medium text-stone-900">
                  {line.productName}
                </span>
                <span className="text-base text-stone-900">
                  {formatMoney(lineTotal(line))}
                </span>
              </div>

              {line.selectedModifiers.length > 0 ? (
                <p className="mt-1 text-sm text-stone-600">
                  {line.selectedModifiers
                    .map((modifier) => modifier.name)
                    .join(", ")}
                </p>
              ) : null}

              {line.notes ? (
                <p className="mt-1 text-sm italic text-stone-500">
                  {line.notes}
                </p>
              ) : null}

              <div className="mt-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      onChangeQuantity(line.lineId, line.quantity - 1)
                    }
                    className="h-10 w-10 rounded-lg border border-stone-300 text-lg"
                  >
                    -
                  </button>
                  <span className="w-7 text-center text-base font-medium">
                    {line.quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      onChangeQuantity(line.lineId, line.quantity + 1)
                    }
                    className="h-10 w-10 rounded-lg border border-stone-300 text-lg"
                  >
                    +
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => onRemove(line.lineId)}
                  className="text-sm text-red-600"
                >
                  remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <OrderTypeSelect value={orderType} onChange={onOrderTypeChange} />
      <PaymentSelect
        value={paymentMethod}
        offline={offline}
        onChange={onPaymentMethodChange}
      />

      <label className="block text-sm text-stone-700">
        order note
        <input
          type="text"
          value={orderNotes}
          onChange={(event) => onOrderNotesChange(event.target.value)}
          placeholder="optional"
          className="mt-2 w-full rounded-xl border border-stone-300 px-4 py-3 text-base outline-none focus:border-stone-800"
        />
      </label>

      <div className="flex items-center justify-between border-t border-stone-200 pt-4">
        <span className="text-base text-stone-600">total</span>
        <span className="text-2xl font-semibold text-stone-900">
          {formatMoney(total)}
        </span>
      </div>

      {paymentBlocked ? (
        <p className="rounded-xl bg-red-100 px-4 py-3 text-sm text-red-900">
          {paymentMethod} needs internet. take cash, or wait for the connection.
        </p>
      ) : null}

      <button
        type="button"
        onClick={onCheckout}
        disabled={lines.length === 0 || submitting || paymentBlocked}
        className="w-full rounded-xl bg-stone-900 px-4 py-4 text-lg font-medium text-white disabled:opacity-50"
      >
        {submitting ? "sending..." : "pay"}
      </button>
    </aside>
  );
}
