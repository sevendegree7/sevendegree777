"use client";

import { useState, useTransition } from "react";

import { updateProduct } from "@/app/admin/actions";
import { formatMoney } from "@/lib/pos/money";
import type { Product } from "@/types/database.types";

type MenuEditorProps = {
  products: Product[];
  categoryNameById: Record<string, string>;
};

// edit price + availability for each product
export function MenuEditor({ products, categoryNameById }: MenuEditorProps) {
  return (
    <div className="space-y-3">
      {products.map((product) => (
        <ProductRow
          key={product.id}
          product={product}
          categoryName={
            product.category_id
              ? (categoryNameById[product.category_id] ?? "uncategorized")
              : "uncategorized"
          }
        />
      ))}
    </div>
  );
}

function ProductRow({
  product,
  categoryName,
}: {
  product: Product;
  categoryName: string;
}) {
  const [price, setPrice] = useState(String(Number(product.base_price)));
  const [available, setAvailable] = useState(product.is_available);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    setMessage(null);
    startTransition(async () => {
      const result = await updateProduct({
        productId: product.id,
        basePrice: price,
        isAvailable: available,
      });
      setMessage(result.ok ? result.message ?? "saved" : result.message);
    });
  }

  return (
    <div className="rounded-2xl bg-raised p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium">{product.name}</p>
          <p className="text-sm text-muted">{categoryName}</p>
          <p className="mt-1 text-xs text-muted">
            current {formatMoney(Number(product.base_price))}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            price
            <input
              type="number"
              min="0"
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="mt-1 block w-28 rounded-xl border border-line px-3 py-2"
            />
          </label>
          <label className="flex items-center gap-2 pb-2 text-sm">
            <input
              type="checkbox"
              checked={available}
              onChange={(e) => setAvailable(e.target.checked)}
            />
            available
          </label>
          <button
            type="button"
            disabled={pending}
            onClick={save}
            className="rounded-xl bg-navy dark:bg-accent-surface dark:text-accent-ink px-4 py-2 text-sm text-cream disabled:opacity-60"
          >
            {pending ? "saving..." : "save"}
          </button>
        </div>
      </div>
      {message ? (
        <p className="mt-2 text-sm text-muted">{message}</p>
      ) : null}
    </div>
  );
}
