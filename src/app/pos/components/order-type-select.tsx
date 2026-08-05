"use client";

import { useTranslate } from "@/lib/i18n/use-language";
import type { OrderType } from "@/types/database.types";

// the values must stay exactly the order_type enum. the label comes from the
// dictionary, keyed by the same value.
const ORDER_TYPES: OrderType[] = ["takeaway", "dine_in", "talabat"];

type OrderTypeSelectProps = {
  value: OrderType;
  onChange: (value: OrderType) => void;
};

export function OrderTypeSelect({ value, onChange }: OrderTypeSelectProps) {
  const { t } = useTranslate();

  return (
    <div>
      <p className="text-sm text-muted">{t("orderType.label")}</p>
      <div className="mt-2 grid grid-cols-3 gap-2">
        {ORDER_TYPES.map((orderType) => (
          <button
            key={orderType}
            type="button"
            onClick={() => onChange(orderType)}
            className={`rounded-xl border px-2 py-3 text-sm font-medium transition-colors ${
              value === orderType
                ? "border-navy bg-navy text-cream dark:border-accent-surface dark:bg-accent-surface dark:text-accent-ink"
                : "border-line bg-surface text-muted"
            }`}
          >
            {t(`orderType.${orderType}`)}
          </button>
        ))}
      </div>
    </div>
  );
}
