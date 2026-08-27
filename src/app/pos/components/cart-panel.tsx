"use client";

import { useState } from "react";

import { useTranslate } from "@/lib/i18n/use-language";
import { cartTotal, lineTotal, type CartLine } from "@/lib/pos/cart";
import { formatMoney } from "@/lib/pos/money";
import { priceSale } from "@/lib/pos/pricing";
import type { TaxSettings } from "@/lib/pos/tax";
import type {
  DiscountKind,
  OrderType,
  PaymentMethod,
} from "@/types/database.types";

import { OrderTypeSelect } from "./order-type-select";
import { PaymentSelect } from "./payment-select";

type CartPanelProps = {
  lines: CartLine[];
  orderType: OrderType;
  paymentMethod: PaymentMethod;
  orderNotes: string;
  customerName: string;
  customerPhone: string;
  discountKind: DiscountKind | null;
  discountValue: string;
  isDiyafa: boolean;
  diyafaReason: string;
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
  onDiscountKindChange: (value: DiscountKind | null) => void;
  onDiscountValueChange: (value: string) => void;
  onDiyafaChange: (value: boolean) => void;
  onDiyafaReasonChange: (value: string) => void;
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
  discountKind,
  discountValue,
  isDiyafa,
  diyafaReason,
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
  onDiscountKindChange,
  onDiscountValueChange,
  onDiyafaChange,
  onDiyafaReasonChange,
  onCheckout,
}: CartPanelProps) {
  const { t } = useTranslate();

  // agel and diyafa both need a name on the paper, so the fields open themselves
  const needsCustomer =
    paymentMethod === "agel" || isDiyafa || customerName !== "" || customerPhone !== "";
  const [customerOpen, setCustomerOpen] = useState(false);
  const showCustomer = customerOpen || needsCustomer;

  const discountNumber = Number(discountValue);
  const money = priceSale({
    lineTotal: cartTotal(lines),
    tax,
    discount:
      !isDiyafa &&
      discountKind &&
      Number.isFinite(discountNumber) &&
      discountNumber > 0
        ? { kind: discountKind, value: discountNumber }
        : null,
    isDiyafa,
  });
  const itemCount = lines.reduce((sum, line) => sum + line.quantity, 0);

  const blocked =
    lines.length === 0 ||
    submitting ||
    (isDiyafa && !diyafaReason.trim()) ||
    (paymentMethod === "agel" && !isDiyafa && !customerName.trim());

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

      <div>
        <p className="text-sm text-muted">{t("cart.discount")}</p>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {(
            [
              { id: null, label: t("cart.discountNone") },
              { id: "percent" as const, label: "%" },
              { id: "fixed" as const, label: "EGP" },
            ] as const
          ).map((option) => (
            <button
              key={String(option.id)}
              type="button"
              disabled={isDiyafa}
              onClick={() => onDiscountKindChange(option.id)}
              className={`rounded-xl border px-2 py-2.5 text-sm font-medium disabled:opacity-40 ${
                discountKind === option.id
                  ? "border-navy bg-navy text-cream dark:border-accent-surface dark:bg-accent-surface dark:text-accent-ink"
                  : "border-line bg-surface text-muted"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        {discountKind && !isDiyafa ? (
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={discountValue}
            onChange={(event) => onDiscountValueChange(event.target.value)}
            placeholder={
              discountKind === "percent"
                ? t("cart.discountPercentHint")
                : t("cart.discountFixedHint")
            }
            className="mt-2 w-full rounded-xl border border-line bg-surface px-4 py-3 text-base text-ink outline-none focus:border-accent"
          />
        ) : null}
      </div>

      <label className="flex items-start gap-3 rounded-xl border border-line bg-surface px-4 py-3">
        <input
          type="checkbox"
          checked={isDiyafa}
          onChange={(event) => onDiyafaChange(event.target.checked)}
          className="mt-1 h-5 w-5 accent-[var(--accent-surface)]"
        />
        <span>
          <span className="block text-sm font-medium">{t("cart.diyafa")}</span>
          <span className="block text-xs text-muted">{t("cart.diyafaHint")}</span>
        </span>
      </label>

      {isDiyafa ? (
        <label className="block text-sm text-muted">
          {t("cart.diyafaReason")}
          <input
            type="text"
            value={diyafaReason}
            onChange={(event) => onDiyafaReasonChange(event.target.value)}
            className="mt-2 w-full rounded-xl border border-line bg-surface px-4 py-3 text-base text-ink outline-none focus:border-accent"
          />
        </label>
      ) : null}

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
          <span className="text-sm text-muted">
            {paymentMethod === "agel" && !isDiyafa
              ? t("cart.customerRequired")
              : t("cart.customerDetails")}
          </span>
          <input
            type="text"
            value={customerName}
            onChange={(event) => onCustomerNameChange(event.target.value)}
            placeholder={t("cart.customerName")}
            className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-base text-ink outline-none focus:border-accent"
          />
          <input
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
        {money.discountAmount > 0 ? (
          <div className="mb-2 flex items-center justify-between text-sm text-muted">
            <span>{t("cart.discount")}</span>
            <span className="font-mono">
              - {formatMoney(money.discountAmount)}
            </span>
          </div>
        ) : null}
        {isDiyafa ? (
          <p className="mb-2 text-sm text-accent">{t("cart.diyafaZero")}</p>
        ) : null}
        <div className="flex items-center justify-between">
          <span className="text-base text-muted">{t("cart.total")}</span>
          <span className="font-mono text-2xl font-semibold">
            {formatMoney(money.payable)}
          </span>
        </div>
      </div>

      <button
        type="button"
        onClick={onCheckout}
        disabled={blocked}
        className="w-full rounded-xl bg-navy px-4 py-4 text-lg font-semibold text-cream transition-opacity disabled:opacity-40 dark:bg-accent-surface dark:text-accent-ink"
      >
        {submitting ? t("cart.sending") : t("cart.pay")}
      </button>
    </aside>
  );
}
