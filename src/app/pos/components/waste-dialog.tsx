"use client";

import { useState, useTransition } from "react";

import { logTillProductWaste } from "@/app/pos/waste-actions";
import { useTranslate } from "@/lib/i18n/use-language";
import type { Product, ProductStock, WasteReason } from "@/types/database.types";

const REASONS: WasteReason[] = [
  "burnt",
  "dropped",
  "expired",
  "spoiled",
  "remake",
  "other",
];

type WasteDialogProps = {
  products: Product[];
  stock: ProductStock[];
  onLogged?: (productId: string, quantity: number) => void;
  onClose: () => void;
};

export function WasteDialog({
  products,
  stock,
  onLogged,
  onClose,
}: WasteDialogProps) {
  const { t } = useTranslate();
  const [step, setStep] = useState<"pin" | "form">("pin");
  const [pin, setPin] = useState("");
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState<WasteReason>("spoiled");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const stockByProduct = new Map(
    stock.map((entry) => [entry.product_id, Number(entry.current_stock)]),
  );

  function unlock() {
    setError(null);
    if (!pin.trim()) {
      setError(t("waste.pinRequired"));
      return;
    }
    // real check happens on submit — this step only collects the PIN so the
    // form is not filled before someone with the code is at the tablet.
    setStep("form");
  }

  function submit() {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await logTillProductWaste({
        pin,
        productId,
        quantity,
        reason,
        notes: notes.trim() || null,
      });
      if (!result.ok) {
        setError(result.message);
        if (result.message === "wrong PIN") {
          setStep("pin");
          setPin("");
        }
        return;
      }
      setMessage(result.message ?? t("waste.logged"));
      onLogged?.(productId, Number(quantity));
      setQuantity("");
      setNotes("");
    });
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-navy/60 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-raised p-5">
        <h2 className="font-display text-xl font-semibold">{t("waste.title")}</h2>
        <p className="mt-1 text-sm text-muted">{t("waste.hint")}</p>

        {step === "pin" ? (
          <>
            <label className="mt-4 block text-sm">
              {t("waste.pin")}
              <input
                type="password"
                inputMode="numeric"
                autoComplete="off"
                autoFocus
                value={pin}
                onChange={(event) => setPin(event.target.value)}
                className="mt-1 w-full rounded-xl border border-line bg-surface px-3 py-3 text-center font-mono text-2xl tracking-[0.4em]"
              />
            </label>
            {error ? (
              <p className="mt-3 rounded-xl bg-danger/15 px-3 py-2 text-sm text-danger">
                {error}
              </p>
            ) : null}
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-xl border border-line px-4 py-3 text-sm"
              >
                {t("receipt.close")}
              </button>
              <button
                type="button"
                onClick={unlock}
                className="flex-[2] rounded-xl bg-navy px-4 py-3 text-sm font-semibold text-cream dark:bg-accent-surface dark:text-accent-ink"
              >
                {t("waste.unlock")}
              </button>
            </div>
          </>
        ) : (
          <>
            {products.length === 0 ? (
              <p className="mt-4 text-sm text-muted">{t("waste.noProducts")}</p>
            ) : (
              <div className="mt-4 space-y-3">
                <label className="block text-sm">
                  {t("waste.product")}
                  <select
                    value={productId}
                    onChange={(event) => setProductId(event.target.value)}
                    className="mt-1 w-full rounded-xl border border-line bg-surface px-3 py-3"
                  >
                    {products.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name} (
                        {stockByProduct.get(product.id) ?? 0} pcs)
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm">
                  {t("waste.quantity")}
                  <input
                    type="number"
                    min="0"
                    step="1"
                    inputMode="numeric"
                    value={quantity}
                    onChange={(event) => setQuantity(event.target.value)}
                    className="mt-1 w-full rounded-xl border border-line bg-surface px-3 py-3"
                  />
                </label>
                <label className="block text-sm">
                  {t("waste.reason")}
                  <select
                    value={reason}
                    onChange={(event) =>
                      setReason(event.target.value as WasteReason)
                    }
                    className="mt-1 w-full rounded-xl border border-line bg-surface px-3 py-3"
                  >
                    {REASONS.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm">
                  {t("waste.notes")}
                  <input
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    className="mt-1 w-full rounded-xl border border-line bg-surface px-3 py-3"
                  />
                </label>
              </div>
            )}

            {error ? (
              <p className="mt-3 rounded-xl bg-danger/15 px-3 py-2 text-sm text-danger">
                {error}
              </p>
            ) : null}
            {message ? (
              <p className="mt-3 rounded-xl bg-ok/15 px-3 py-2 text-sm text-ok">
                {message}
              </p>
            ) : null}

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={pending}
                className="flex-1 rounded-xl border border-line px-4 py-3 text-sm disabled:opacity-50"
              >
                {t("receipt.close")}
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={pending || products.length === 0}
                className="flex-[2] rounded-xl bg-navy px-4 py-3 text-sm font-semibold text-cream disabled:opacity-50 dark:bg-accent-surface dark:text-accent-ink"
              >
                {pending ? t("waste.saving") : t("waste.log")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
