"use client";

import { useTranslate } from "@/lib/i18n/use-language";
import { formatMoney } from "@/lib/pos/money";
import { useScrollLock } from "@/lib/ui/use-scroll-lock";
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
  const { t } = useTranslate();

  useScrollLock();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/60 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-raised p-6 shadow-xl">
        <p className="font-mono text-[0.7rem] uppercase tracking-[0.16em] text-muted">
          {t("confirm.title")}
        </p>
        <p className="mt-2 font-mono text-4xl font-semibold">
          {formatMoney(total)}
        </p>

        <dl className="mt-5 space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted">{t("confirm.items")}</dt>
            <dd className="font-mono">{itemCount}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">{t("orderType.label")}</dt>
            <dd>{t(`orderType.${orderType}`)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">{t("payment.label")}</dt>
            <dd>{t(`payment.${paymentMethod}`)}</dd>
          </div>
        </dl>

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="flex-1 rounded-xl border border-line px-4 py-3 text-base disabled:opacity-50"
          >
            {t("confirm.back")}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={submitting}
            className="flex-[2] rounded-xl bg-navy px-4 py-3 text-base font-semibold text-cream disabled:opacity-50 dark:bg-accent-surface dark:text-accent-ink"
          >
            {submitting ? t("cart.sending") : t("confirm.confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
