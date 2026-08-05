"use client";

import { useState, useTransition } from "react";

import { updateOperatingSettings } from "@/app/admin/actions";
import type { AppSettings, InventoryMode } from "@/types/database.types";

export function SettingsForm({ settings }: { settings: AppSettings }) {
  const [kdsEnabled, setKdsEnabled] = useState(settings.kds_enabled);
  const [inventoryMode, setInventoryMode] = useState<InventoryMode>(
    settings.inventory_mode,
  );
  const [receiptCopies, setReceiptCopies] = useState(settings.receipt_copies);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    setMessage(null);
    startTransition(async () => {
      const result = await updateOperatingSettings({
        kdsEnabled,
        inventoryMode,
        receiptCopies,
      });
      setMessage(result.ok ? result.message ?? "saved" : result.message);
    });
  }

  return (
    <div className="max-w-2xl space-y-4">
      <section className="rounded-2xl bg-raised p-5 shadow-sm">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={kdsEnabled}
            onChange={(event) => setKdsEnabled(event.target.checked)}
            className="mt-1 h-5 w-5"
          />
          <span>
            <span className="block font-medium">Use kitchen display</span>
            <span className="mt-1 block text-sm text-muted">
              Off: cashier sales complete immediately and no kitchen ticket is
              created. On: sales enter pending and appear on /kds.
            </span>
          </span>
        </label>
      </section>

      <section className="rounded-2xl bg-raised p-5 shadow-sm">
        <label className="block text-sm">
          Inventory mode
          <select
            value={inventoryMode}
            onChange={(event) =>
              setInventoryMode(event.target.value as InventoryMode)
            }
            className="mt-2 w-full rounded-xl border border-line px-3 py-3"
          >
            <option value="finished_goods">
              Finished goods (receive ready bakes into the vitrine)
            </option>
            <option value="ingredients">
              Ingredients (deduct recipe/BOM materials)
            </option>
          </select>
        </label>
      </section>

      <section className="rounded-2xl bg-raised p-5 shadow-sm">
        <label className="block text-sm">
          Receipt copies per sale
          <select
            value={receiptCopies}
            onChange={(event) => setReceiptCopies(Number(event.target.value))}
            className="mt-2 w-full rounded-xl border border-line px-3 py-3"
          >
            <option value={1}>1 copy</option>
            <option value={2}>2 copies (customer + baker/prep)</option>
            <option value={3}>3 copies</option>
          </select>
        </label>
      </section>

      <button
        type="button"
        disabled={pending}
        onClick={save}
        className="rounded-xl bg-navy dark:bg-accent-surface dark:text-accent-ink px-5 py-3 text-cream disabled:opacity-50"
      >
        {pending ? "Saving..." : "Save settings"}
      </button>

      {message ? <p className="text-sm text-muted">{message}</p> : null}
    </div>
  );
}
