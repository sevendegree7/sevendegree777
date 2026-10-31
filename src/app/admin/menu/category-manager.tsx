"use client";

import { useState, useTransition } from "react";

import {
  createCategory,
  setCategoryActive,
  updateCategory,
} from "@/app/admin/actions";
import { useTranslate } from "@/lib/i18n/use-language";
import type { Category, Product } from "@/types/database.types";

type CategoryManagerProps = {
  categories: Category[];
  products: Product[];
};

export function CategoryManager({
  categories,
  products,
}: CategoryManagerProps) {
  const { t } = useTranslate();
  const [showArchived, setShowArchived] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#D4A24A");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const visible = categories.filter((category) =>
    showArchived ? true : category.is_active !== false,
  );

  function create() {
    setMessage(null);
    startTransition(async () => {
      const result = await createCategory({ name, color });
      setMessage(result.message ?? "");
      if (result.ok) {
        setName("");
      }
    });
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-line bg-raised p-4 shadow-sm sm:p-5">
        <div className="max-w-2xl">
          <h2 className="font-display text-2xl font-semibold">
            {t("admin.menu.addCategory")}
          </h2>
          <p className="mt-2 text-sm text-muted">
            {t("admin.menu.addCategoryHint")}
          </p>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_7rem_auto] sm:items-end">
          <label className="text-sm">
            {t("admin.menu.name")}
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Snacks"
              className="mt-1 block w-full rounded-xl border border-line bg-surface px-3 py-3 text-ink"
            />
          </label>
          <label className="text-sm">
            {t("admin.menu.categoryColor")}
            <input
              type="color"
              value={color}
              onChange={(event) => setColor(event.target.value)}
              className="mt-1 block h-12 w-full cursor-pointer rounded-xl border border-line bg-surface px-1 py-1"
            />
          </label>
          <button
            type="button"
            disabled={pending}
            onClick={create}
            className="min-h-12 rounded-xl bg-navy px-5 py-3 text-sm font-semibold text-cream disabled:opacity-60 dark:bg-accent-surface dark:text-accent-ink"
          >
            {pending
              ? t("admin.menu.creatingCategory")
              : t("admin.menu.createCategory")}
          </button>
        </div>

        {message ? <p className="mt-3 text-sm text-muted">{message}</p> : null}
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          {t("admin.menu.categoryCount", { count: visible.length })}
        </p>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(event) => setShowArchived(event.target.checked)}
            className="h-5 w-5 accent-[var(--accent-surface)]"
          />
          {t("admin.menu.showArchived")}
        </label>
      </div>

      <div className="space-y-3">
        {visible.length === 0 ? (
          <p className="rounded-xl border border-line bg-raised p-4 text-sm text-muted">
            {t("admin.menu.noCategories")}
          </p>
        ) : (
          visible.map((category) => (
            <CategoryRow
              key={category.id}
              category={category}
              productCount={
                products.filter(
                  (product) => product.category_id === category.id,
                ).length
              }
            />
          ))
        )}
      </div>
    </div>
  );
}

function CategoryRow({
  category,
  productCount,
}: {
  category: Category;
  productCount: number;
}) {
  const { t } = useTranslate();
  const [name, setName] = useState(category.name);
  const [color, setColor] = useState(category.color ?? "#D4A24A");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    setMessage(null);
    startTransition(async () => {
      const result = await updateCategory({
        categoryId: category.id,
        name,
        color,
      });
      setMessage(result.message ?? "");
    });
  }

  function toggleArchive() {
    setMessage(null);
    startTransition(async () => {
      const result = await setCategoryActive({
        categoryId: category.id,
        active: category.is_active === false,
      });
      setMessage(result.message ?? "");
    });
  }

  return (
    <div
      className={`rounded-2xl border border-line bg-raised p-4 sm:p-5 ${
        category.is_active === false ? "opacity-70" : ""
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">
          {t("admin.menu.categoryProductCount", { count: productCount })}
        </p>
        {category.is_active === false ? (
          <span className="rounded-full border border-line px-2 py-0.5 text-xs text-muted">
            {t("admin.menu.archived")}
          </span>
        ) : null}
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_7rem] sm:items-end">
        <label className="text-sm">
          {t("admin.menu.name")}
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="mt-1 block w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-ink"
          />
        </label>
        <label className="text-sm">
          {t("admin.menu.categoryColor")}
          <input
            type="color"
            value={color}
            onChange={(event) => setColor(event.target.value)}
            className="mt-1 block h-11 w-full cursor-pointer rounded-xl border border-line bg-surface px-1 py-1"
          />
        </label>
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          disabled={pending}
          onClick={save}
          className="min-h-11 flex-1 rounded-xl bg-navy px-4 py-2 text-sm font-semibold text-cream disabled:opacity-60 dark:bg-accent-surface dark:text-accent-ink"
        >
          {pending ? t("admin.menu.saving") : t("admin.menu.save")}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={toggleArchive}
          className="min-h-11 rounded-xl border border-line px-4 py-2 text-sm disabled:opacity-60"
        >
          {category.is_active === false
            ? t("admin.menu.restore")
            : t("admin.menu.archive")}
        </button>
      </div>

      {message ? <p className="mt-2 text-sm text-muted">{message}</p> : null}
    </div>
  );
}
