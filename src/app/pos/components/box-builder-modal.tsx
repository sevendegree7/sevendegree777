"use client";

import { useEffect, useMemo, useState } from "react";

import { useTranslate } from "@/lib/i18n/use-language";
import {
  boxContentsTotal,
  formatBoxContents,
  mergeBoxContent,
} from "@/lib/pos/box";
import { formatMoney } from "@/lib/pos/money";
import type {
  BoxContent,
  Modifier,
  Product,
  SelectedModifier,
} from "@/types/database.types";

type BoxBuilderModalProps = {
  product: Product;
  flavors: Product[];
  modifiers: Modifier[];
  onCancel: () => void;
  onAdd: (
    boxContents: BoxContent[],
    selectedModifiers: SelectedModifier[],
    quantity: number,
    notes: string | null,
  ) => void;
};

// dunkin-style pack builder: fill the box to piece_count, then optional extras
export function BoxBuilderModal({
  product,
  flavors,
  modifiers,
  onCancel,
  onAdd,
}: BoxBuilderModalProps) {
  const { t } = useTranslate();
  const pieceCount = product.piece_count ?? 0;
  const [contents, setContents] = useState<BoxContent[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  const selected = boxContentsTotal(contents);
  const remaining = pieceCount - selected;
  const canAdd = remaining === 0 && pieceCount > 0;

  const selectedModifiers: SelectedModifier[] = useMemo(
    () =>
      modifiers
        .filter((modifier) => selectedIds.includes(modifier.id))
        .map((modifier) => ({
          id: modifier.id,
          name: modifier.name,
          extra_price: Number(modifier.extra_price),
        })),
    [modifiers, selectedIds],
  );

  function addFlavor(flavor: Product) {
    if (remaining <= 0) return;
    setContents((current) => mergeBoxContent(current, flavor, 1));
  }

  function removeFlavor(flavor: Product) {
    setContents((current) => mergeBoxContent(current, flavor, -1));
  }

  function toggleExtra(modifierId: string) {
    setSelectedIds((current) =>
      current.includes(modifierId)
        ? current.filter((id) => id !== modifierId)
        : [...current, modifierId],
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-navy/60 p-4 sm:items-center">
      <button
        type="button"
        aria-label={t("box.cancel")}
        onClick={onCancel}
        className="absolute inset-0 h-full w-full cursor-default"
      />

      <div className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-line bg-raised p-6 shadow-xl">
        <p className="font-mono text-[0.7rem] uppercase tracking-[0.16em] text-muted">
          {t("box.title")}
        </p>
        <h2 className="font-display mt-1 text-2xl font-semibold">
          {product.name}
        </h2>
        <p className="mt-1 text-sm text-muted">
          {t("box.pick", { count: pieceCount })}
        </p>
        <p className="mt-1 font-mono text-sm text-accent">
          {t("box.selected", { count: selected, total: pieceCount })}
        </p>

        <div className="mt-5 space-y-2">
          {flavors.length === 0 ? (
            <p className="rounded-xl border border-line bg-surface p-4 text-sm text-muted">
              {t("box.empty")}
            </p>
          ) : (
            flavors.map((flavor) => {
              const inBox =
                contents.find((piece) => piece.id === flavor.id)?.quantity ?? 0;

              return (
                <div
                  key={flavor.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface px-3 py-2"
                >
                  <div>
                    <p className="text-sm font-medium capitalize">
                      {flavor.name}
                    </p>
                    {inBox > 0 ? (
                      <p className="font-mono text-xs text-muted">{inBox}×</p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={inBox === 0}
                      onClick={() => removeFlavor(flavor)}
                      className="h-10 w-10 rounded-xl border border-line text-lg disabled:opacity-40"
                    >
                      -
                    </button>
                    <button
                      type="button"
                      disabled={remaining <= 0}
                      onClick={() => addFlavor(flavor)}
                      className="h-10 w-10 rounded-xl border border-line text-lg disabled:opacity-40"
                    >
                      +
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {contents.length > 0 ? (
          <p className="mt-3 text-sm text-muted">
            {t("box.contents")}: {formatBoxContents(contents)}
          </p>
        ) : null}

        {modifiers.length > 0 ? (
          <div className="mt-5 space-y-2">
            {modifiers.map((modifier) => {
              const checked = selectedIds.includes(modifier.id);
              const extra = Number(modifier.extra_price);

              return (
                <label
                  key={modifier.id}
                  className={`flex cursor-pointer items-center justify-between rounded-xl border px-4 py-3 ${
                    checked
                      ? "border-accent bg-accent-surface/10"
                      : "border-line bg-surface"
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleExtra(modifier.id)}
                      className="h-5 w-5 accent-[var(--accent-surface)]"
                    />
                    <span>{modifier.name}</span>
                  </span>
                  <span className="font-mono text-sm text-muted">
                    {extra > 0 ? `+ ${formatMoney(extra)}` : t("modifier.free")}
                  </span>
                </label>
              );
            })}
          </div>
        ) : null}

        <div className="mt-5 flex items-center justify-between">
          <span className="text-sm text-muted">{t("modifier.quantity")}</span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setQuantity((current) => Math.max(1, current - 1))}
              className="h-11 w-11 rounded-xl border border-line text-xl"
            >
              -
            </button>
            <span className="w-8 text-center font-mono text-lg">{quantity}</span>
            <button
              type="button"
              onClick={() => setQuantity((current) => current + 1)}
              className="h-11 w-11 rounded-xl border border-line text-xl"
            >
              +
            </button>
          </div>
        </div>

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

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-xl border border-line px-4 py-3 text-base"
          >
            {t("box.cancel")}
          </button>
          <button
            type="button"
            disabled={!canAdd}
            onClick={() =>
              onAdd(
                contents,
                selectedModifiers,
                quantity,
                notes.trim() ? notes.trim() : null,
              )
            }
            className="flex-[2] rounded-xl bg-navy px-4 py-3 text-base font-semibold text-cream disabled:opacity-50 dark:bg-accent-surface dark:text-accent-ink"
          >
            {t("box.add")} · {formatMoney(Number(product.base_price) * quantity)}
          </button>
        </div>
      </div>
    </div>
  );
}
