"use client";

import type { PaymentMethod } from "@/types/database.types";

// labels only - the values must stay exactly the payment_method enum
const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "cash", label: "cash" },
  { value: "card", label: "card" },
  { value: "instapay", label: "instapay" },
];

type PaymentSelectProps = {
  value: PaymentMethod;
  onChange: (value: PaymentMethod) => void;
};

export function PaymentSelect({ value, onChange }: PaymentSelectProps) {
  return (
    <div>
      <p className="text-sm text-stone-700">payment</p>
      <div className="mt-2 grid grid-cols-3 gap-2">
        {PAYMENT_METHODS.map((method) => (
          <button
            key={method.value}
            type="button"
            onClick={() => onChange(method.value)}
            className={`rounded-xl border px-2 py-3 text-sm font-medium ${
              value === method.value
                ? "border-stone-900 bg-stone-900 text-white"
                : "border-stone-300 bg-white text-stone-700"
            }`}
          >
            {method.label}
          </button>
        ))}
      </div>
    </div>
  );
}
