"use client";

import type { OrderType } from "@/types/database.types";

// labels only - the values must stay exactly the order_type enum
const ORDER_TYPES: { value: OrderType; label: string }[] = [
  { value: "takeaway", label: "takeaway" },
  { value: "dine_in", label: "dine in" },
  { value: "talabat", label: "talabat" },
];

type OrderTypeSelectProps = {
  value: OrderType;
  onChange: (value: OrderType) => void;
};

export function OrderTypeSelect({ value, onChange }: OrderTypeSelectProps) {
  return (
    <div>
      <p className="text-sm text-stone-700">order type</p>
      <div className="mt-2 grid grid-cols-3 gap-2">
        {ORDER_TYPES.map((orderType) => (
          <button
            key={orderType.value}
            type="button"
            onClick={() => onChange(orderType.value)}
            className={`rounded-xl border px-2 py-3 text-sm font-medium ${
              value === orderType.value
                ? "border-stone-900 bg-stone-900 text-white"
                : "border-stone-300 bg-white text-stone-700"
            }`}
          >
            {orderType.label}
          </button>
        ))}
      </div>
    </div>
  );
}
