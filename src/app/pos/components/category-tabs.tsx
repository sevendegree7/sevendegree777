"use client";

import { useTranslate } from "@/lib/i18n/use-language";
import { readableInkOn } from "@/lib/ui/contrast";
import type { Category } from "@/types/database.types";

type CategoryTabsProps = {
  categories: Category[];
  activeCategoryId: string | null;
  onSelect: (categoryId: string | null) => void;
};

// filter row above the product grid. null means show everything.
//
// four tabs now - desserts, extras, boxes, beverages - and each carries a
// colour from the brand palette. the cuisine colour has moved down onto the
// individual product cards, where the wayfinding actually matters.
export function CategoryTabs({
  categories,
  activeCategoryId,
  onSelect,
}: CategoryTabsProps) {
  const { t } = useTranslate();

  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => onSelect(null)}
        className={`rounded-xl border px-4 py-3 text-sm font-medium transition-colors ${
          activeCategoryId === null
            ? "border-navy bg-navy text-cream dark:border-accent-surface dark:bg-accent-surface dark:text-accent-ink"
            : "border-line bg-raised text-muted"
        }`}
      >
        {t("pos.allCategories")}
      </button>

      {categories.map((category) => {
        const active = activeCategoryId === category.id;
        const colour = category.color;

        return (
          <button
            key={category.id}
            type="button"
            onClick={() => onSelect(category.id)}
            style={
              active && colour
                ? {
                    backgroundColor: colour,
                    borderColor: colour,
                    color: readableInkOn(colour),
                  }
                : undefined
            }
            className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium transition-colors ${
              active
                ? "border-navy bg-navy text-cream"
                : "border-line bg-raised text-muted"
            }`}
          >
            {colour && !active ? (
              <span
                aria-hidden
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: colour }}
              />
            ) : null}
            {category.name}
          </button>
        );
      })}
    </div>
  );
}
