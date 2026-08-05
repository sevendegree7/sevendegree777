"use client";

import { useTranslate } from "@/lib/i18n/use-language";
import type { PaymentMethod } from "@/types/database.types";

// the values must stay exactly the payment_method enum
const PAYMENT_METHODS: PaymentMethod[] = ["cash", "card", "instapay"];

type PaymentSelectProps = {
  value: PaymentMethod;
  onChange: (value: PaymentMethod) => void;
};

// every method is offered whether or not the tablet has a line out. the card
// terminal and instapay are settled on their own device beside the till, so
// this is only recording which way the money already came in.
export function PaymentSelect({ value, onChange }: PaymentSelectProps) {
  const { t } = useTranslate();

  return (
    <div>
      <p className="text-sm text-muted">{t("payment.label")}</p>
      <div className="mt-2 grid grid-cols-3 gap-2">
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
