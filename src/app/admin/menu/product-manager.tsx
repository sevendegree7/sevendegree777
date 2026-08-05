"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

import {
  archiveProduct,
  createProduct,
  updateProduct,
} from "@/app/admin/actions";
import { useTranslate } from "@/lib/i18n/use-language";
import { formatMoney } from "@/lib/pos/money";
import type { Category, Product } from "@/types/database.types";

type ProductManagerProps = {
  products: Product[];
  categories: Category[];
};

export function ProductManager({ products, categories }: ProductManagerProps) {
  const { t } = useTranslate();
  const [showArchived, setShowArchived] = useState(false);

  const activeCategories = categories.filter(
    (category) => category.is_active !== false,
  );

  const visible = products.filter((product) =>
    showArchived ? true : product.is_available,
  );

  return (
    <div className="space-y-6">
      <CreateProductForm categories={activeCategories} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          {t("admin.menu.productCount", { count: visible.length })}
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
            {t("admin.menu.noProducts")}
          </p>
        ) : (
          visible.map((product) => (
            <ProductRow
              key={product.id}
              product={product}
              categories={activeCategories}
              categoryName={
                product.category_id
                  ? (categories.find((category) => category.id === product.category_id)
                      ?.name ?? t("admin.menu.uncategorized"))
                  : t("admin.menu.uncategorized")
              }
            />
          ))
        )}
      </div>
    </div>
  );
}

function CreateProductForm({ categories }: { categories: Category[] }) {
  const { t } = useTranslate();
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [price, setPrice] = useState("");
  const [pieceCount, setPieceCount] = useState("6");
  const [contentsCategoryId, setContentsCategoryId] = useState(
    categories.find((category) => category.name.toLowerCase() === "desserts")
      ?.id ??
      categories.find((category) => category.name.toLowerCase() !== "boxes")
        ?.id ??
      "",
  );
  const [available, setAvailable] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const selected = categories.find((category) => category.id === categoryId);
  const isBox = selected?.name.toLowerCase() === "boxes";
  const contentOptions = categories.filter(
    (category) => category.name.toLowerCase() !== "boxes",
  );

  function create() {
    setMessage(null);
    startTransition(async () => {
      const result = await createProduct({
        name,
        categoryId,
        basePrice: price,
        isAvailable: available,
        pieceCount,
        contentsCategoryId,
      });
      setMessage(result.message ?? (result.ok ? t("admin.menu.created") : ""));
      if (result.ok) {
        setName("");
        setPrice("");
        setAvailable(true);
      }
    });
  }

  return (
    <section className="rounded-2xl border border-line bg-raised p-4 sm:p-5">
      <h2 className="font-display text-xl font-semibold">
        {t("admin.menu.addProduct")}
      </h2>
      <p className="mt-1 text-sm text-muted">{t("admin.menu.addProductHint")}</p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-sm sm:col-span-2">
          {t("admin.menu.name")}
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="mt-1 block w-full rounded-xl border border-line bg-surface px-3 py-3 text-ink"
          />
        </label>

        <label className="text-sm">
          {t("admin.menu.category")}
          <select
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
            className="mt-1 block w-full rounded-xl border border-line bg-surface px-3 py-3 text-ink"
          >
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm">
          {t("admin.menu.price")}
          <input
            type="number"
            min="0"
            step="0.01"
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            className="mt-1 block w-full rounded-xl border border-line bg-surface px-3 py-3 text-ink"
          />
        </label>

        {isBox ? (
          <>
            <label className="text-sm">
              {t("admin.menu.pieceCount")}
              <input
                type="number"
                min="1"
                step="1"
                value={pieceCount}
                onChange={(event) => setPieceCount(event.target.value)}
                className="mt-1 block w-full rounded-xl border border-line bg-surface px-3 py-3 text-ink"
              />
            </label>
            <label className="text-sm">
              {t("admin.menu.contains")}
              <select
                value={contentsCategoryId}
                onChange={(event) => setContentsCategoryId(event.target.value)}
                className="mt-1 block w-full rounded-xl border border-line bg-surface px-3 py-3 text-ink"
              >
                {contentOptions.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : null}

        <label className="flex min-h-11 items-center gap-2 text-sm sm:col-span-2">
          <input
            type="checkbox"
            checked={available}
            onChange={(event) => setAvailable(event.target.checked)}
            className="h-5 w-5 accent-[var(--accent-surface)]"
          />
          {t("admin.menu.available")}
        </label>
      </div>

      <button
        type="button"
        disabled={pending}
        onClick={create}
        className="mt-4 min-h-12 w-full rounded-xl bg-navy px-5 py-3 text-sm font-semibold text-cream disabled:opacity-60 sm:w-auto dark:bg-accent-surface dark:text-accent-ink"
      >
        {pending ? t("admin.menu.creating") : t("admin.menu.create")}
      </button>

      {message ? <p className="mt-3 text-sm text-muted">{message}</p> : null}
    </section>
  );
}

function ProductRow({
  product,
  categories,
  categoryName,
}: {
  product: Product;
  categories: Category[];
  categoryName: string;
}) {
  const { t } = useTranslate();
  const [name, setName] = useState(product.name);
  const [categoryId, setCategoryId] = useState(product.category_id ?? "");
  const [price, setPrice] = useState(String(Number(product.base_price)));
  const [pieceCount, setPieceCount] = useState(
    product.piece_count ? String(product.piece_count) : "6",
  );
  const [contentsCategoryId, setContentsCategoryId] = useState(
    product.contents_category_id ??
      categories.find((category) => category.name.toLowerCase() === "desserts")
        ?.id ??
      "",
  );
  const [available, setAvailable] = useState(product.is_available);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const selected = categories.find((category) => category.id === categoryId);
  const isBox = selected?.name.toLowerCase() === "boxes";
  const contentOptions = categories.filter(
    (category) => category.name.toLowerCase() !== "boxes",
  );

  function save() {
    setMessage(null);
    startTransition(async () => {
      const result = await updateProduct({
        productId: product.id,
        name,
        categoryId,
        basePrice: price,
        isAvailable: available,
        pieceCount,
        contentsCategoryId,
      });
      setMessage(result.message ?? (result.ok ? t("admin.menu.saved") : ""));
    });
  }

  function toggleArchive() {
    setMessage(null);
    startTransition(async () => {
      const result = await archiveProduct({
        productId: product.id,
        archive: product.is_available,
      });
      setMessage(result.message ?? "");
      if (result.ok) {
        setAvailable(!product.is_available);
      }
    });
  }

  return (
    <div className="rounded-2xl border border-line bg-raised p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium capitalize">{product.name}</p>
          <p className="text-sm text-muted">{categoryName}</p>
          <p className="mt-1 font-mono text-xs text-muted">
            {formatMoney(Number(product.base_price))}
            {product.piece_count
              ? ` · ${t("admin.menu.packOf", { count: product.piece_count })}`
              : ""}
          </p>
        </div>
        {!product.is_available ? (
          <span className="rounded-full bg-sunken px-2 py-1 text-xs text-muted">
            {t("admin.menu.archived")}
          </span>
        ) : null}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-sm sm:col-span-2">
          {t("admin.menu.name")}
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="mt-1 block w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-ink"
          />
        </label>
        <label className="text-sm">
          {t("admin.menu.category")}
          <select
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
            className="mt-1 block w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-ink"
          >
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          {t("admin.menu.price")}
          <input
            type="number"
            min="0"
            step="0.01"
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            className="mt-1 block w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-ink"
          />
        </label>
        {isBox ? (
          <>
            <label className="text-sm">
              {t("admin.menu.pieceCount")}
              <input
                type="number"
                min="1"
                step="1"
                value={pieceCount}
                onChange={(event) => setPieceCount(event.target.value)}
                className="mt-1 block w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-ink"
              />
            </label>
            <label className="text-sm">
              {t("admin.menu.contains")}
              <select
                value={contentsCategoryId}
                onChange={(event) => setContentsCategoryId(event.target.value)}
                className="mt-1 block w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-ink"
              >
                {contentOptions.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : null}
        <label className="flex min-h-11 items-center gap-2 text-sm sm:col-span-2">
          <input
            type="checkbox"
            checked={available}
            onChange={(event) => setAvailable(event.target.checked)}
            className="h-5 w-5 accent-[var(--accent-surface)]"
          />
          {t("admin.menu.available")}
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
          {product.is_available
            ? t("admin.menu.archive")
            : t("admin.menu.restore")}
        </button>
      </div>

      {message ? <p className="mt-2 text-sm text-muted">{message}</p> : null}
    </div>
  );
}

export function MenuTabs() {
  const { t } = useTranslate();
  const searchParams = useSearchParams();
  const tab = searchParams.get("tab") === "extras" ? "extras" : "products";

  return (
    <div className="sticky top-0 z-10 -mx-4 mb-6 flex gap-2 overflow-x-auto border-b border-line bg-surface px-4 py-3 sm:-mx-6 sm:px-6">
      <Link
        href="/admin/menu?tab=products"
        className={`shrink-0 rounded-xl px-4 py-2.5 text-sm font-medium ${
          tab === "products"
            ? "bg-navy text-cream dark:bg-accent-surface dark:text-accent-ink"
            : "border border-line bg-raised text-muted"
        }`}
      >
        {t("admin.menu.tabProducts")}
      </Link>
      <Link
        href="/admin/menu?tab=extras"
        className={`shrink-0 rounded-xl px-4 py-2.5 text-sm font-medium ${
          tab === "extras"
            ? "bg-navy text-cream dark:bg-accent-surface dark:text-accent-ink"
            : "border border-line bg-raised text-muted"
        }`}
      >
        {t("admin.menu.tabExtras")}
      </Link>
    </div>
  );
}
