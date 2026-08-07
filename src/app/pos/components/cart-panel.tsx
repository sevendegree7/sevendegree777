"use client";

import { useState } from "react";

import { useTranslate } from "@/lib/i18n/use-language";
import { cartTotal, lineTotal, type CartLine } from "@/lib/pos/cart";
import { formatMoney } from "@/lib/pos/money";
import { applyTax, type TaxSettings } from "@/lib/pos/tax";
import type { OrderType, PaymentMethod } from "@/types/database.types";

import { OrderTypeSelect } from "./order-type-select";
import { PaymentSelect } from "./payment-select";

type CartPanelProps = {
  lines: CartLine[];
  orderType: OrderType;
  paymentMethod: PaymentMethod;
  orderNotes: string;
  customerName: string;
  customerPhone: string;
  // the same rule the server will charge on. shown here so the number the
  // cashier reads out is the number that ends up on the paper.
  tax: TaxSettings;
  submitting: boolean;
  onChangeQuantity: (lineId: string, quantity: number) => void;
  onRemove: (lineId: string) => void;
  onClear: () => void;
  onOrderTypeChange: (value: OrderType) => void;
  onPaymentMethodChange: (value: PaymentMethod) => void;
  onOrderNotesChange: (value: string) => void;
  onCustomerNameChange: (value: string) => void;
  onCustomerPhoneChange: (value: string) => void;
  onCheckout: () => void;
};

// right hand ticket: lines, totals and the pay button
export function CartPanel({
  lines,
  orderType,
  paymentMethod,
  orderNotes,
  customerName,
  customerPhone,
  tax,
  submitting,
  onChangeQuantity,
  onRemove,
  onClear,
  onOrderTypeChange,
  onPaymentMethodChange,
  onOrderNotesChange,
  onCustomerNameChange,
  onCustomerPhoneChange,
  onCheckout,
}: CartPanelProps) {
  const { t } = useTranslate();

  // folded away by default, and it stays open once something is typed. taking a
  // name is worth two taps when the customer offers one, and worth nothing at
  // all during a rush - so it never sits between the cashier and the pay button.
  const [customerOpen, setCustomerOpen] = useState(false);
  const showCustomer = customerOpen || customerName !== "" || customerPhone !== "";

  // the same call the server makes at checkout, on the same lines, so the two
  // cannot disagree about what is owed
  const money = applyTax(cartTotal(lines), tax);
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

              {line.boxContents.length > 0 ? (
                <p className="mt-1 text-sm text-muted">
                  {line.boxContents
                    .map((piece) => `${piece.quantity}× ${piece.name}`)
                    .join(", ")}
                </p>
              ) : null}

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
      <PaymentSelect value={paymentMethod} onChange={onPaymentMethodChange} />

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

      {showCustomer ? (
        <div className="flex flex-col gap-2">
          <span className="text-sm text-muted">{t("cart.customerDetails")}</span>
          <input
            type="text"
            value={customerName}
            onChange={(event) => onCustomerNameChange(event.target.value)}
            placeholder={t("cart.customerName")}
            className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-base text-ink outline-none focus:border-accent"
          />
          <input
            // tel, not number: a phone can start with a zero and the tablet
            // should bring up a keypad rather than a spinner
            type="tel"
            inputMode="tel"
            value={customerPhone}
            onChange={(event) => onCustomerPhoneChange(event.target.value)}
            placeholder={t("cart.customerPhone")}
            className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-base text-ink outline-none focus:border-accent"
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setCustomerOpen(true)}
          className="self-start text-sm text-muted underline"
        >
          + {t("cart.customerDetails")}
        </button>
      )}

      <div className="border-t border-line pt-4">
        {/* only when there is tax to show. a truck with no tax set up gets the
            single total line it has always had, unchanged. */}
        {money.tax > 0 ? (
          <div className="mb-2 space-y-1 text-sm text-muted">
            <div className="flex items-center justify-between">
              <span>{t("cart.subtotal")}</span>
              <span className="font-mono">{formatMoney(money.subtotal)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>
                {money.label} {money.rate}%
              </span>
              <span className="font-mono">{formatMoney(money.tax)}</span>
            </div>
          </div>
        ) : null}
        <div className="flex items-center justify-between">
          <span className="text-base text-muted">{t("cart.total")}</span>
          <span className="font-mono text-2xl font-semibold">
            {formatMoney(money.total)}
          </span>
        </div>
      </div>

      <button
        type="button"
        onClick={onCheckout}
        disabled={lines.length === 0 || submitting}
        className="w-full rounded-xl bg-navy px-4 py-4 text-lg font-semibold text-cream transition-opacity disabled:opacity-40 dark:bg-accent-surface dark:text-accent-ink"
      >
        {submitting ? t("cart.sending") : t("cart.pay")}
      </button>
    </aside>
  );
}
