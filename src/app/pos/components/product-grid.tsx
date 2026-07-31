"use client";

import { formatMoney } from "@/lib/pos/money";
import type { Product } from "@/types/database.types";

type ProductGridProps = {
  products: Product[];
  // products with modifiers open the popup instead of adding straight away
  hasModifiers: (productId: string) => boolean;
  onSelect: (product: Product) => void;
};

// touch grid of everything the cashier can sell
export function ProductGrid({
  products,
  hasModifiers,
  onSelect,
}: ProductGridProps) {
  if (products.length === 0) {
    return (
      <p className="rounded-2xl bg-white p-6 text-stone-600 shadow-sm">
        no products here yet. run seed.sql or pick another category.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
      {products.map((product) => (
        <button
          key={product.id}
          type="button"
          onClick={() => onSelect(product)}
          className="flex min-h-28 flex-col justify-between rounded-2xl border border-stone-200 bg-white p-4 text-left shadow-sm active:border-stone-900"
        >
          <span className="text-base font-medium leading-snug text-stone-900">
            {product.name}
          </span>
          <span className="mt-2 text-sm text-stone-600">
            {formatMoney(Number(product.base_price))}
            {hasModifiers(product.id) ? " · options" : ""}
          </span>
        </button>
      ))}
    </div>
  );
}
