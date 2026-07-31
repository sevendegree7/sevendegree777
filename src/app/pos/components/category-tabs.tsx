"use client";

import type { Category } from "@/types/database.types";

type CategoryTabsProps = {
  categories: Category[];
  activeCategoryId: string | null;
  onSelect: (categoryId: string | null) => void;
};

// filter row above the product grid. null means show everything.
export function CategoryTabs({
  categories,
  activeCategoryId,
  onSelect,
}: CategoryTabsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => onSelect(null)}
        className={`rounded-xl border px-4 py-3 text-sm font-medium ${
          activeCategoryId === null
            ? "border-stone-900 bg-stone-900 text-white"
            : "border-stone-300 bg-white text-stone-700"
        }`}
      >
        all
      </button>

      {categories.map((category) => (
        <button
          key={category.id}
          type="button"
          onClick={() => onSelect(category.id)}
          className={`rounded-xl border px-4 py-3 text-sm font-medium ${
            activeCategoryId === category.id
              ? "border-stone-900 bg-stone-900 text-white"
              : "border-stone-300 bg-white text-stone-700"
          }`}
        >
          {category.name}
        </button>
      ))}
    </div>
  );
}
