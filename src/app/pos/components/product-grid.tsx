"use client";

import { useTranslate } from "@/lib/i18n/use-language";
import { formatMoney } from "@/lib/pos/money";
import type { Product } from "@/types/database.types";

type ProductGridProps = {
  products: Product[];
  // products with modifiers open the popup instead of adding straight away
  hasModifiers: (productId: string) => boolean;
  // the cuisine colour of the product's category, or null if it has none
  colourOf: (product: Product) => string | null;
  onSelect: (product: Product) => void;
};

// touch grid of everything the cashier can sell
export function ProductGrid({
  products,
  hasModifiers,
  colourOf,
  onSelect,
}: ProductGridProps) {
  const { t } = useTranslate();

  if (products.length === 0) {
    return (
      <p className="rounded-2xl border border-line bg-raised p-6 text-muted">
        {t("pos.noProducts")}
      </p>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
      {products.map((product) => {
        const colour = colourOf(product);

        return (
          <button
            key={product.id}
            type="button"
            onClick={() => onSelect(product)}
            // the cuisine colour sits on the edge of the card rather than
            // behind the text, so the name stays at full contrast in the sun
            style={colour ? { borderInlineStartColor: colour } : undefined}
            className={`flex min-h-28 flex-col justify-between rounded-2xl border border-line bg-raised p-4 text-start transition-transform active:scale-[0.98] ${
              colour ? "border-s-4" : ""
            }`}
          >
            <span className="text-base font-medium leading-snug">
              {product.name}
            </span>
            <span className="mt-2 font-mono text-sm text-muted">
              {formatMoney(Number(product.base_price))}
              {hasModifiers(product.id) ? ` · ${t("pos.options")}` : ""}
            </span>
          </button>
        );
      })}
    </div>
  );
}
