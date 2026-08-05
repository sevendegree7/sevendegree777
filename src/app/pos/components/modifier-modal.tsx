"use client";

import { useEffect, useState } from "react";

import { useTranslate } from "@/lib/i18n/use-language";
import { lineTotal, lineUnitPrice } from "@/lib/pos/cart";
import { formatMoney } from "@/lib/pos/money";
import { useScrollLock } from "@/lib/ui/use-scroll-lock";
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
  const { t } = useTranslate();

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState("");

  useScrollLock();

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/60 p-4">
      {/* backdrop tap closes without adding anything */}
      <button
        type="button"
        aria-label={t("modifier.cancel")}
        onClick={onCancel}
        className="absolute inset-0 h-full w-full cursor-default"
      />

      {/* dvh, not vh: the tablet's top bar grows as it scrolls and vh keeps
          counting the space it took, which pushed the panel off screen. the
          title and the buttons stay put and only the middle scrolls. */}
      <div className="relative flex max-h-[85dvh] w-full max-w-sm flex-col overflow-hidden rounded-2xl border border-line bg-raised shadow-xl">
        <div className="shrink-0 border-b border-line px-5 py-4">
          <p className="font-mono text-[0.7rem] uppercase tracking-[0.16em] text-muted">
            {t("modifier.addToCart")}
          </p>
          <h2 className="font-display mt-1 text-xl font-semibold">
            {product.name}
          </h2>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
          <div className="space-y-2">
            {modifiers.map((modifier) => {
              const checked = selectedIds.includes(modifier.id);
              const extra = Number(modifier.extra_price);

              return (
                <label
                  key={modifier.id}
                  className={`flex cursor-pointer items-center justify-between rounded-xl border px-4 py-3 transition-colors ${
                    checked
                      ? "border-accent bg-accent-surface/10"
                      : "border-line bg-surface"
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(modifier.id)}
                      className="h-5 w-5 accent-[var(--accent-surface)]"
                    />
                    <span className="text-base">{modifier.name}</span>
                  </span>
                  <span className="font-mono text-sm text-muted">
                    {extra > 0 ? `+ ${formatMoney(extra)}` : t("modifier.free")}
                  </span>
                </label>
              );
            })}
          </div>

          <div className="mt-5 flex items-center justify-between">
            <span className="text-sm text-muted">{t("modifier.quantity")}</span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                aria-label="-"
                onClick={() =>
                  setQuantity((current) => Math.max(1, current - 1))
                }
                className="h-11 w-11 rounded-xl border border-line text-xl"
              >
                -
              </button>
              <span className="w-8 text-center font-mono text-lg font-medium">
                {quantity}
              </span>
              <button
                type="button"
                aria-label="+"
                onClick={() => setQuantity((current) => current + 1)}
                className="h-11 w-11 rounded-xl border border-line text-xl"
              >
                +
              </button>
            </div>
          </div>

          <p className="mt-2 text-end font-mono text-sm text-muted">
            {t("modifier.each", { price: formatMoney(unitPrice) })}
          </p>

          <label className="mt-4 block text-sm text-muted">
            {t("modifier.kitchenNote")}
            <input
              type="text"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder={t("cart.optional")}
              className="mt-2 w-full rounded-xl border border-line bg-surface px-4 py-3 text-base text-ink outline-none focus:border-accent"
            />
          </label>
        </div>

        <div className="flex shrink-0 gap-3 border-t border-line px-5 py-4">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-xl border border-line px-4 py-3 text-base"
          >
            {t("modifier.cancel")}
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
            className="flex-[2] rounded-xl bg-navy px-4 py-3 text-base font-semibold text-cream dark:bg-accent-surface dark:text-accent-ink"
          >
            {t("modifier.add")} · {formatMoney(lineTotal(draftLine))}
          </button>
        </div>
      </div>
    </div>
  );
}
