"use client";

import { useState, useTransition } from "react";

import { logProductWaste } from "@/app/admin/actions";
import type { Product, ProductStock, WasteReason } from "@/types/database.types";

const REASONS: WasteReason[] = [
  "burnt",
  "dropped",
  "expired",
  "spoiled",
  "remake",
  "other",
];

export function FinishedWasteForm({
  products,
  stock,
}: {
  products: Product[];
  stock: ProductStock[];
}) {
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const [quantity, setQuantity] = useState("0");
  const [reason, setReason] = useState<WasteReason>("spoiled");
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const stockByProduct = new Map(
    stock.map((entry) => [entry.product_id, Number(entry.current_stock)]),
  );

  function submit() {
    setMessage(null);
    startTransition(async () => {
      const result = await logProductWaste({
        productId,
        quantity: Number(quantity),
        reason,
        notes: notes.trim() || null,
      });
      setMessage(result.ok ? result.message ?? "logged" : result.message);
      if (result.ok) {
        setQuantity("0");
        setNotes("");
      }
    });
  }

  if (products.length === 0) return <p>no products to waste-log.</p>;

  return (
    <div className="max-w-xl rounded-2xl bg-raised p-5 shadow-sm">
      <label className="block text-sm">
        finished product
        <select
          value={productId}
          onChange={(event) => setProductId(event.target.value)}
          className="mt-1 w-full rounded-xl border border-line px-3 py-2"
        >
          {products.map((product) => (
            <option key={product.id} value={product.id}>
              {product.name} ({stockByProduct.get(product.id) ?? 0} pcs)
            </option>
          ))}
        </select>
      </label>

      <label className="mt-4 block text-sm">
        pieces lost
        <input
          type="number"
          min="0"
          step="1"
          value={quantity}
          onChange={(event) => setQuantity(event.target.value)}
          className="mt-1 w-full rounded-xl border border-line px-3 py-2"
        />
      </label>

      <label className="mt-4 block text-sm">
        reason
        <select
          value={reason}
          onChange={(event) => setReason(event.target.value as WasteReason)}
          className="mt-1 w-full rounded-xl border border-line px-3 py-2"
        >
          {REASONS.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </label>

      <label className="mt-4 block text-sm">
        notes
        <input
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          className="mt-1 w-full rounded-xl border border-line px-3 py-2"
        />
      </label>

      <button
        type="button"
        disabled={pending}
        onClick={submit}
        className="mt-5 rounded-xl bg-navy dark:bg-accent-surface dark:text-accent-ink px-4 py-3 text-sm text-cream disabled:opacity-50"
      >
        {pending ? "saving..." : "log waste"}
      </button>

      {message ? <p className="mt-3 text-sm text-muted">{message}</p> : null}
    </div>
  );
}
