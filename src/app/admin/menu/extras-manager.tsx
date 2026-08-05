"use client";

import { useState, useTransition } from "react";

import {
  createGlobalExtra,
  updateGlobalExtra,
} from "@/app/admin/actions";
import { formatMoney } from "@/lib/pos/money";
import type { Modifier } from "@/types/database.types";

export function ExtrasManager({ extras }: { extras: Modifier[] }) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function create() {
    setMessage(null);

    startTransition(async () => {
      const result = await createGlobalExtra({ name, extraPrice: price });
      setMessage(result.message ?? (result.ok ? "Extra created" : "Could not create extra"));

      if (result.ok) {
        setName("");
        setPrice("");
      }
    });
  }

  return (
    <section className="mb-8 rounded-2xl border border-line bg-raised p-4 shadow-sm sm:p-5">
      <div className="max-w-2xl">
        <p className="font-mono text-[0.7rem] uppercase tracking-[0.16em] text-muted">
          Shared extras
        </p>
        <h2 className="font-display mt-1 text-2xl font-semibold">
          Extras for every item
        </h2>
        <p className="mt-2 text-sm text-muted">
          Create an extra once. Every active extra appears when the cashier taps
          any dessert, box, or beverage.
        </p>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_9rem_auto] sm:items-end">
        <label className="text-sm">
          Extra name
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Extra chocolate"
            className="mt-1 block w-full rounded-xl border border-line bg-surface px-3 py-3 text-ink"
          />
        </label>
        <label className="text-sm">
          Price
          <input
            type="number"
            min="0"
            step="0.01"
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            placeholder="25"
            className="mt-1 block w-full rounded-xl border border-line bg-surface px-3 py-3 text-ink"
          />
        </label>
        <button
          type="button"
          disabled={pending}
          onClick={create}
          className="min-h-12 rounded-xl bg-navy px-5 py-3 text-sm font-semibold text-cream disabled:opacity-60 dark:bg-accent-surface dark:text-accent-ink"
        >
          {pending ? "Creating..." : "Create extra"}
        </button>
      </div>

      {message ? <p className="mt-3 text-sm text-muted">{message}</p> : null}

      <div className="mt-6 space-y-3">
        {extras.length === 0 ? (
          <p className="rounded-xl bg-sunken p-4 text-sm text-muted">
            No extras yet.
          </p>
        ) : (
          extras.map((extra) => <ExtraRow key={extra.id} extra={extra} />)
        )}
      </div>
    </section>
  );
}

function ExtraRow({ extra }: { extra: Modifier }) {
  const [name, setName] = useState(extra.name);
  const [price, setPrice] = useState(String(Number(extra.extra_price)));
  const [active, setActive] = useState(extra.is_active !== false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    setMessage(null);

    startTransition(async () => {
      const result = await updateGlobalExtra({
        modifierId: extra.id,
        name,
        extraPrice: price,
        isActive: active,
      });
      setMessage(result.message ?? (result.ok ? "Saved" : "Could not save"));
    });
  }

  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem_auto_auto] sm:items-end">
        <label className="text-sm">
          Name
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="mt-1 block w-full rounded-xl border border-line bg-raised px-3 py-2.5 text-ink"
          />
        </label>
        <label className="text-sm">
          Price
          <input
            type="number"
            min="0"
            step="0.01"
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            className="mt-1 block w-full rounded-xl border border-line bg-raised px-3 py-2.5 text-ink"
          />
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={active}
            onChange={(event) => setActive(event.target.checked)}
            className="h-5 w-5 accent-[var(--accent-surface)]"
          />
          Active
        </label>
        <button
          type="button"
          disabled={pending}
          onClick={save}
          className="min-h-11 rounded-xl border border-navy px-4 py-2 text-sm font-medium text-ink disabled:opacity-60 dark:border-accent"
        >
          {pending ? "Saving..." : "Save"}
        </button>
      </div>
      <div className="mt-2 flex flex-wrap justify-between gap-2 text-xs text-muted">
        <span>
          Current: {Number(extra.extra_price) > 0
            ? formatMoney(Number(extra.extra_price))
            : "No charge"}
        </span>
        {message ? <span>{message}</span> : null}
      </div>
    </div>
  );
}
