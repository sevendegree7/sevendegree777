"use client";

import { useEffect, useState } from "react";

import { lineTotal, lineUnitPrice } from "@/lib/pos/cart";
import { formatMoney } from "@/lib/pos/money";
import type {
  Modifier,
  Product,
  SelectedModifier,
} from "@/types/database.types";

type ModifierModalProps = {
  product: Product;
  modifiers: Modifier[];
  onCancel: () => void;
  onAdd: (
    selectedModifiers: SelectedModifier[],
    quantity: number,
    notes: string | null,
  ) => void;
};

// popup for picking extras, quantity and a kitchen note before adding to cart
export function ModifierModal({
  product,
  modifiers,
  onCancel,
  onAdd,
}: ModifierModalProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onCancel();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  const selectedModifiers: SelectedModifier[] = modifiers
    .filter((modifier) => selectedIds.includes(modifier.id))
    .map((modifier) => ({
      id: modifier.id,
      name: modifier.name,
      extra_price: Number(modifier.extra_price),
    }));

  const draftLine = {
    basePrice: Number(product.base_price),
    quantity,
    selectedModifiers,
  };

  const unitPrice = lineUnitPrice(draftLine);

  function toggle(modifierId: string) {
    setSelectedIds((current) =>
      current.includes(modifierId)
        ? current.filter((id) => id !== modifierId)
        : [...current, modifierId],
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-stone-900/40 p-4 sm:items-center">
      {/* backdrop tap closes without adding anything */}
      <button
        type="button"
        aria-label="close"
        onClick={onCancel}
        className="absolute inset-0 h-full w-full cursor-default"
      />

      <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-lg">
        <p className="text-sm text-stone-500">add to cart</p>
        <h2 className="mt-1 text-2xl font-semibold text-stone-900">
          {product.name}
        </h2>

        <div className="mt-5 space-y-2">
          {modifiers.map((modifier) => {
            const checked = selectedIds.includes(modifier.id);
            const extra = Number(modifier.extra_price);

            return (
              <label
                key={modifier.id}
                className={`flex cursor-pointer items-center justify-between rounded-xl border px-4 py-3 ${
                  checked
                    ? "border-stone-900 bg-stone-50"
                    : "border-stone-300 bg-white"
                }`}
              >
                <span className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(modifier.id)}
                    className="h-5 w-5"
                  />
                  <span className="text-base text-stone-900">
                    {modifier.name}
                  </span>
                </span>
                <span className="text-sm text-stone-600">
                  {extra > 0 ? `+ ${formatMoney(extra)}` : "free"}
                </span>
              </label>
            );
          })}
        </div>

        <div className="mt-5 flex items-center justify-between">
          <span className="text-sm text-stone-700">quantity</span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setQuantity((current) => Math.max(1, current - 1))}
              className="h-11 w-11 rounded-xl border border-stone-300 text-xl"
            >
              -
            </button>
            <span className="w-8 text-center text-lg font-medium">
              {quantity}
            </span>
            <button
              type="button"
              onClick={() => setQuantity((current) => current + 1)}
              className="h-11 w-11 rounded-xl border border-stone-300 text-xl"
            >
              +
            </button>
          </div>
        </div>

        <p className="mt-2 text-right text-sm text-stone-600">
          {formatMoney(unitPrice)} each
        </p>

        <label className="mt-4 block text-sm text-stone-700">
          note for the kitchen
          <input
            type="text"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="optional"
            className="mt-2 w-full rounded-xl border border-stone-300 px-4 py-3 text-base outline-none focus:border-stone-800"
          />
        </label>

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-xl border border-stone-300 px-4 py-3 text-base"
          >
            cancel
          </button>
          <button
            type="button"
            onClick={() =>
              onAdd(
                selectedModifiers,
                quantity,
                notes.trim() ? notes.trim() : null,
              )
            }
            className="flex-[2] rounded-xl bg-stone-900 px-4 py-3 text-base font-medium text-white"
          >
            add · {formatMoney(lineTotal(draftLine))}
          </button>
        </div>
      </div>
    </div>
  );
}
