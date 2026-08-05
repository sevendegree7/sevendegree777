"use client";

import { useTranslate } from "@/lib/i18n/use-language";
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
  const { t } = useTranslate();

  const total = cartTotal(lines);
  const itemCount = lines.reduce((sum, line) => sum + line.quantity, 0);

  return (
    <aside className="flex flex-col gap-4 rounded-2xl border border-line bg-raised p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold">
          {t("cart.title")}
          {itemCount > 0 ? ` · ${itemCount}` : ""}
        </h2>
        {lines.length > 0 ? (
          <button
            type="button"
            onClick={onClear}
            className="text-sm text-muted underline"
          >
            {t("cart.clear")}
          </button>
        ) : null}
      </div>

      {lines.length === 0 ? (
        <p className="py-6 text-sm text-muted">{t("cart.empty")}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {lines.map((line) => (
            <li key={line.lineId} className="rounded-xl border border-line p-3">
              <div className="flex items-start justify-between gap-2">
                <span className="text-base font-medium">
                  {line.productName}
                </span>
                <span className="font-mono text-base">
                  {formatMoney(lineTotal(line))}
                </span>
              </div>

              {line.selectedModifiers.length > 0 ? (
                <p className="mt-1 text-sm text-muted">
                  {line.selectedModifiers
                    .map((modifier) => modifier.name)
                    .join(", ")}
                </p>
              ) : null}

              {line.notes ? (
                <p className="font-accent mt-1 text-sm text-muted">
                  {line.notes}
                </p>
              ) : null}

              <div className="mt-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-label="-"
                    onClick={() =>
                      onChangeQuantity(line.lineId, line.quantity - 1)
                    }
                    className="h-10 w-10 rounded-lg border border-line text-lg"
                  >
                    -
                  </button>
                  <span className="w-7 text-center font-mono text-base font-medium">
                    {line.quantity}
                  </span>
                  <button
                    type="button"
                    aria-label="+"
                    onClick={() =>
                      onChangeQuantity(line.lineId, line.quantity + 1)
                    }
                    className="h-10 w-10 rounded-lg border border-line text-lg"
                  >
                    +
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => onRemove(line.lineId)}
                  className="text-sm text-danger"
                >
                  {t("cart.remove")}
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

      <label className="block text-sm text-muted">
        {t("cart.orderNote")}
        <input
          type="text"
          value={orderNotes}
          onChange={(event) => onOrderNotesChange(event.target.value)}
          placeholder={t("cart.optional")}
          className="mt-2 w-full rounded-xl border border-line bg-surface px-4 py-3 text-base text-ink outline-none focus:border-accent"
        />
      </label>

      <div className="flex items-center justify-between border-t border-line pt-4">
        <span className="text-base text-muted">{t("cart.total")}</span>
        <span className="font-mono text-2xl font-semibold">
          {formatMoney(total)}
        </span>
      </div>

      {paymentBlocked ? (
        <p className="rounded-xl bg-danger/15 px-4 py-3 text-sm text-danger">
          {t("cart.paymentNeedsInternet", {
            method: t(`payment.${paymentMethod}`),
          })}
        </p>
      ) : null}

      <button
        type="button"
        onClick={onCheckout}
        disabled={lines.length === 0 || submitting || paymentBlocked}
        className="w-full rounded-xl bg-navy px-4 py-4 text-lg font-semibold text-cream transition-opacity disabled:opacity-40 dark:bg-accent-surface dark:text-accent-ink"
      >
        {submitting ? t("cart.sending") : t("cart.pay")}
      </button>
    </aside>
  );
}
