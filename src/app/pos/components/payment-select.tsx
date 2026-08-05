"use client";

import { useTranslate } from "@/lib/i18n/use-language";
import type { PaymentMethod } from "@/types/database.types";

// the values must stay exactly the payment_method enum
const PAYMENT_METHODS: PaymentMethod[] = ["cash", "card", "instapay"];

// cash is the only one the truck can take with the internet down
const NEEDS_INTERNET: PaymentMethod[] = ["card", "instapay"];

type PaymentSelectProps = {
  value: PaymentMethod;
  offline: boolean;
  onChange: (value: PaymentMethod) => void;
};

export function PaymentSelect({
  value,
  offline,
  onChange,
}: PaymentSelectProps) {
  const { t } = useTranslate();

  return (
    <div>
      <p className="text-sm text-muted">{t("payment.label")}</p>
      <div className="mt-2 grid grid-cols-3 gap-2">
        {PAYMENT_METHODS.map((method) => {
          const blocked = offline && NEEDS_INTERNET.includes(method);

          return (
            <button
              key={method}
              type="button"
              onClick={() => onChange(method)}
              disabled={blocked}
              title={blocked ? t("payment.needsInternet") : undefined}
              className={`rounded-xl border px-2 py-3 text-sm font-medium transition-colors disabled:opacity-40 ${
                value === method
                  ? "border-navy bg-navy text-cream dark:border-accent-surface dark:bg-accent-surface dark:text-accent-ink"
                  : "border-line bg-surface text-muted"
              }`}
            >
              {t(`payment.${method}`)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
