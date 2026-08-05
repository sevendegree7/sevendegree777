"use client";

import { useState, useTransition } from "react";

import { restockItem, updateThreshold } from "@/app/admin/actions";
import type { InventoryItem } from "@/types/database.types";

type InventoryPanelProps = {
  items: InventoryItem[];
};

export function InventoryPanel({ items }: InventoryPanelProps) {
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <InventoryRow key={item.id} item={item} />
      ))}
    </div>
  );
}

function InventoryRow({ item }: { item: InventoryItem }) {
  const [addQty, setAddQty] = useState("0");
  const [threshold, setThreshold] = useState(String(Number(item.min_threshold)));
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const low = Number(item.current_stock) <= Number(item.min_threshold);

  function onRestock() {
    setMessage(null);
    startTransition(async () => {
      const result = await restockItem({
        itemId: item.id,
        addQuantity: addQty,
      });
      setMessage(result.ok ? result.message ?? "updated" : result.message);
      if (result.ok) setAddQty("0");
    });
  }

  function onThreshold() {
    setMessage(null);
    startTransition(async () => {
      const result = await updateThreshold({
        itemId: item.id,
        minThreshold: threshold,
      });
      setMessage(result.ok ? "threshold saved" : result.message);
    });
  }

  return (
    <div
      className={
        low
          ? "rounded-2xl border border-danger bg-danger/10 p-4"
          : "rounded-2xl bg-raised p-4 shadow-sm"
      }
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium">{item.name}</p>
          <p className="text-sm text-muted">
            {Number(item.current_stock)} {item.unit}
            {low ? " · low" : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            add stock
            <input
              type="number"
              min="0"
              step="0.001"
              value={addQty}
              onChange={(e) => setAddQty(e.target.value)}
              className="mt-1 block w-28 rounded-xl border border-line px-3 py-2"
            />
          </label>
          <button
            type="button"
            disabled={pending}
            onClick={onRestock}
            className="rounded-xl bg-navy dark:bg-accent-surface dark:text-accent-ink px-4 py-2 text-sm text-cream disabled:opacity-60"
          >
            restock
          </button>
          <label className="text-sm">
            min
            <input
              type="number"
              min="0"
              step="0.001"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              className="mt-1 block w-28 rounded-xl border border-line px-3 py-2"
            />
          </label>
          <button
            type="button"
            disabled={pending}
            onClick={onThreshold}
            className="rounded-xl border border-line px-4 py-2 text-sm"
          >
            save min
          </button>
        </div>
      </div>
      {message ? (
        <p className="mt-2 text-sm text-muted">{message}</p>
      ) : null}
    </div>
  );
}
