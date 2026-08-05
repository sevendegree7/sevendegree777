"use client";

import { useState, useTransition } from "react";

import { deleteRecipe, upsertRecipe } from "@/app/admin/actions";
import type { InventoryItem, Product, Recipe } from "@/types/database.types";

type RecipesPanelProps = {
  products: Product[];
  inventory: InventoryItem[];
  recipes: Recipe[];
};

export function RecipesPanel({
  products,
  inventory,
  recipes,
}: RecipesPanelProps) {
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const [itemId, setItemId] = useState(inventory[0]?.id ?? "");
  const [qty, setQty] = useState("1");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const productName: Record<string, string> = {};
  for (const product of products) productName[product.id] = product.name;

  const itemName: Record<string, string> = {};
  for (const item of inventory) {
    itemName[item.id] = `${item.name} (${item.unit})`;
  }

  function save() {
    setMessage(null);
    startTransition(async () => {
      const result = await upsertRecipe({
        productId,
        inventoryItemId: itemId,
        quantityRequired: Number(qty),
      });
      setMessage(result.ok ? result.message ?? "saved" : result.message);
    });
  }

  function remove(recipeId: string) {
    setMessage(null);
    startTransition(async () => {
      const result = await deleteRecipe(recipeId);
      setMessage(result.ok ? "removed" : result.message);
    });
  }

  return (
    <div className="space-y-6">
      <div className="max-w-xl rounded-2xl bg-raised p-5 shadow-sm">
        <h2 className="font-medium">add or update recipe line</h2>
        <label className="mt-4 block text-sm">
          product
          <select
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            className="mt-1 w-full rounded-xl border border-line px-3 py-2"
          >
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name}
              </option>
            ))}
          </select>
        </label>
        <label className="mt-3 block text-sm">
          ingredient
          <select
            value={itemId}
            onChange={(e) => setItemId(e.target.value)}
            className="mt-1 w-full rounded-xl border border-line px-3 py-2"
          >
            {inventory.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} ({item.unit})
              </option>
            ))}
          </select>
        </label>
        <label className="mt-3 block text-sm">
          quantity required per 1 product
          <input
            type="number"
            min="0"
            step="0.001"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            className="mt-1 w-full rounded-xl border border-line px-3 py-2"
          />
        </label>
        <button
          type="button"
          disabled={pending}
          onClick={save}
          className="mt-4 rounded-xl bg-navy dark:bg-accent-surface dark:text-accent-ink px-4 py-2 text-sm text-cream disabled:opacity-60"
        >
          {pending ? "saving..." : "save recipe line"}
        </button>
        {message ? <p className="mt-3 text-sm text-muted">{message}</p> : null}
      </div>

      <div className="rounded-2xl bg-raised p-5 shadow-sm">
        <h2 className="font-medium">current recipes</h2>
        {recipes.length === 0 ? (
          <p className="mt-2 text-sm text-muted">no recipes yet</p>
        ) : (
          <ul className="mt-3 divide-y divide-line text-sm">
            {recipes.map((recipe) => (
              <li
                key={recipe.id}
                className="flex flex-wrap items-center justify-between gap-2 py-3"
              >
                <span>
                  {productName[recipe.product_id] ?? "product"} →{" "}
                  {Number(recipe.quantity_required)}{" "}
                  {itemName[recipe.inventory_item_id] ?? "item"}
                </span>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => remove(recipe.id)}
                  className="rounded-lg border border-line px-3 py-1 text-xs"
                >
                  remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
