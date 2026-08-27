"use client";

import { useTranslate } from "@/lib/i18n/use-language";
import type { PaymentMethod } from "@/types/database.types";

// cash / card / instapay settle beside the till. agel is pay later - the money
// is still owed, and only admin can mark it collected later.
const PAYMENT_METHODS: PaymentMethod[] = ["cash", "card", "instapay", "agel"];

type PaymentSelectProps = {
  value: PaymentMethod;
  onChange: (value: PaymentMethod) => void;
};

export function PaymentSelect({ value, onChange }: PaymentSelectProps) {
  const { t } = useTranslate();

  return (
    <div>
      <p className="text-sm text-muted">{t("payment.label")}</p>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {PAYMENT_METHODS.map((method) => (
          <button
            key={method}
            type="button"
            onClick={() => onChange(method)}
            className={`rounded-xl border px-2 py-3 text-sm font-medium transition-colors ${
              value === method
                ? "border-navy bg-navy text-cream dark:border-accent-surface dark:bg-accent-surface dark:text-accent-ink"
                : "border-line bg-surface text-muted"
            }`}
          >
            {t(`payment.${method}`)}
          </button>
        ))}
      </div>
    </div>
  );
}
