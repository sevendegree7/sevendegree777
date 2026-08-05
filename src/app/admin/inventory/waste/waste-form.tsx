"use client";

import { useState, useTransition } from "react";

import { logWaste } from "@/app/admin/actions";
import type { InventoryItem, WasteReason } from "@/types/database.types";

const REASONS: WasteReason[] = [
  "burnt",
  "dropped",
  "expired",
  "spoiled",
  "remake",
  "other",
];

type WasteFormProps = {
  items: InventoryItem[];
};

export function WasteForm({ items }: WasteFormProps) {
  const [itemId, setItemId] = useState(items[0]?.id ?? "");
  const [quantity, setQuantity] = useState("0");
  const [reason, setReason] = useState<WasteReason>("burnt");
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setMessage(null);
    startTransition(async () => {
      const result = await logWaste({
        itemId,
        quantity: Number(quantity),
        reason,
        notes: notes.trim() ? notes.trim() : null,
      });
      setMessage(result.ok ? result.message ?? "logged" : result.message);
      if (result.ok) {
        setQuantity("0");
        setNotes("");
      }
    });
  }

  if (items.length === 0) {
    return <p className="text-muted">no inventory items to waste-log.</p>;
  }

  return (
    <div className="max-w-xl rounded-2xl bg-raised p-5 shadow-sm">
      <label className="block text-sm">
        ingredient
        <select
          value={itemId}
          onChange={(e) => setItemId(e.target.value)}
          className="mt-1 w-full rounded-xl border border-line px-3 py-2"
        >
          {items.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name} ({Number(item.current_stock)} {item.unit})
            </option>
          ))}
        </select>
      </label>

      <label className="mt-4 block text-sm">
        quantity lost
        <input
          type="number"
          min="0"
          step="0.001"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          className="mt-1 w-full rounded-xl border border-line px-3 py-2"
        />
      </label>

      <label className="mt-4 block text-sm">
        reason
        <select
          value={reason}
          onChange={(e) => setReason(e.target.value as WasteReason)}
          className="mt-1 w-full rounded-xl border border-line px-3 py-2"
        >
          {REASONS.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </label>

      <label className="mt-4 block text-sm">
        notes
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="mt-1 w-full rounded-xl border border-line px-3 py-2"
          placeholder="optional"
        />
      </label>

      <button
        type="button"
        disabled={pending}
        onClick={submit}
        className="mt-5 rounded-xl bg-navy dark:bg-accent-surface dark:text-accent-ink px-4 py-3 text-sm text-cream disabled:opacity-60"
      >
        {pending ? "saving..." : "log waste"}
      </button>

      {message ? <p className="mt-3 text-sm text-muted">{message}</p> : null}
    </div>
  );
}
