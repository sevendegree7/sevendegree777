"use client";

import { useState, useTransition } from "react";

import {
  receiveProductStock,
  setProductStock,
  updateProductStockThreshold,
} from "@/app/admin/actions";
import type { Product, ProductStock } from "@/types/database.types";

type Row = ProductStock & { name: string };

export function FinishedStockPanel({
  products,
  stock,
}: {
  products: Product[];
  stock: ProductStock[];
}) {
  const byProduct = new Map(stock.map((entry) => [entry.product_id, entry]));
  const rows: Row[] = products.map((product) => ({
    product_id: product.id,
    name: product.name,
    current_stock: Number(byProduct.get(product.id)?.current_stock ?? 0),
    min_threshold: Number(byProduct.get(product.id)?.min_threshold ?? 0),
    updated_at: byProduct.get(product.id)?.updated_at ?? "",
  }));

  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <FinishedStockRow key={row.product_id} row={row} />
      ))}
    </div>
  );
}

function FinishedStockRow({ row }: { row: Row }) {
  const [addQuantity, setAddQuantity] = useState("0");
  const [setQuantity, setSetQuantity] = useState(String(row.current_stock));
  const [shownStock, setShownStock] = useState(row.current_stock);
  const [threshold, setThreshold] = useState(String(row.min_threshold));
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const low = shownStock <= row.min_threshold;

  function receive() {
    setMessage(null);
    startTransition(async () => {
      const result = await receiveProductStock({
        productId: row.product_id,
        addQuantity,
      });
      setMessage(result.ok ? result.message ?? "received" : result.message);
      if (result.ok) {
        const added = Number(addQuantity);
        if (Number.isFinite(added) && added > 0) {
          const next = shownStock + added;
          setShownStock(next);
          setSetQuantity(String(next));
        }
        setAddQuantity("0");
      }
    });
  }

  function correct() {
    setMessage(null);
    startTransition(async () => {
      const result = await setProductStock({
        productId: row.product_id,
        quantity: setQuantity,
      });
      setMessage(result.ok ? result.message ?? "stock updated" : result.message);
      if (result.ok) {
        const next = Number(setQuantity);
        if (Number.isFinite(next)) setShownStock(next);
      }
    });
  }

  function saveThreshold() {
    setMessage(null);
    startTransition(async () => {
      const result = await updateProductStockThreshold({
        productId: row.product_id,
        minThreshold: threshold,
      });
      setMessage(result.ok ? result.message ?? "saved" : result.message);
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
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-medium">{row.name}</p>
          <p className="text-sm text-muted">
            {shownStock} pieces in vitrine{low ? " · low" : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-sm">
            receive pieces
            <input
              type="number"
              min="0"
              step="1"
              value={addQuantity}
              onChange={(event) => setAddQuantity(event.target.value)}
              className="mt-1 block w-28 rounded-xl border border-line px-3 py-2"
            />
          </label>
          <button
            type="button"
            disabled={pending}
            onClick={receive}
            className="rounded-xl bg-navy dark:bg-accent-surface dark:text-accent-ink px-4 py-2 text-sm text-cream disabled:opacity-50"
          >
            receive
          </button>
          <label className="text-sm">
            correct to
            <input
              type="number"
              min="0"
              step="1"
              value={setQuantity}
              onChange={(event) => setSetQuantity(event.target.value)}
              className="mt-1 block w-28 rounded-xl border border-line px-3 py-2"
            />
          </label>
          <button
            type="button"
            disabled={pending}
            onClick={correct}
            className="rounded-xl border border-line px-4 py-2 text-sm disabled:opacity-50"
          >
            set stock
          </button>
          <label className="text-sm">
            low at
            <input
              type="number"
              min="0"
              step="1"
              value={threshold}
              onChange={(event) => setThreshold(event.target.value)}
              className="mt-1 block w-24 rounded-xl border border-line px-3 py-2"
            />
          </label>
          <button
            type="button"
            disabled={pending}
            onClick={saveThreshold}
            className="rounded-xl border border-line px-4 py-2 text-sm"
          >
            save min
          </button>
        </div>
      </div>
      {message ? <p className="mt-2 text-sm text-muted">{message}</p> : null}
    </div>
  );
}
