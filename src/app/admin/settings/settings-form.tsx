"use client";

import { useState, useTransition } from "react";

import { updateOperatingSettings } from "@/app/admin/actions";
import { formatMoney } from "@/lib/pos/money";
import { applyTax, normaliseRate } from "@/lib/pos/tax";
import type {
  AppSettings,
  InventoryMode,
  TaxMode,
} from "@/types/database.types";

// a bill to work the example on. a round hundred makes the two tax modes
// tell their difference at a glance without anybody doing arithmetic.
const EXAMPLE_BILL = 100;

export function SettingsForm({ settings }: { settings: AppSettings }) {
  const [kdsEnabled, setKdsEnabled] = useState(settings.kds_enabled);
  const [inventoryMode, setInventoryMode] = useState<InventoryMode>(
    settings.inventory_mode,
  );
  const [receiptCopies, setReceiptCopies] = useState(settings.receipt_copies);
  const [taxEnabled, setTaxEnabled] = useState(settings.tax_enabled ?? false);
  const [taxLabel, setTaxLabel] = useState(settings.tax_label ?? "VAT");
  // a string, not a number: a number input mid-type produces "14." and "" and
  // both are states a person passes through on the way to a real rate
  const [taxRate, setTaxRate] = useState(String(settings.tax_rate ?? ""));
  const [taxMode, setTaxMode] = useState<TaxMode>(settings.tax_mode ?? "added");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // the same function the till and the server use, on a bill of 100. this is
  // the whole safety net for the one setting on this page that changes what a
  // customer is charged - nobody should have to guess which mode they picked.
  const example = applyTax(EXAMPLE_BILL, {
    enabled: taxEnabled,
    label: taxLabel,
    rate: normaliseRate(taxRate),
    mode: taxMode,
  });

  function save() {
    setMessage(null);
    startTransition(async () => {
      const result = await updateOperatingSettings({
        kdsEnabled,
        inventoryMode,
        receiptCopies,
        taxEnabled,
        taxLabel,
        taxRate,
        taxMode,
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

      <section className="rounded-2xl bg-raised p-5 shadow-sm">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={taxEnabled}
            onChange={(event) => setTaxEnabled(event.target.checked)}
            className="mt-1 h-5 w-5"
          />
          <span>
            <span className="block font-medium">Charge tax on the receipt</span>
            <span className="mt-1 block text-sm text-muted">
              Off: the receipt shows one total, as it does today. On: every new
              sale is split into a subtotal and a tax line.
            </span>
          </span>
        </label>

        {taxEnabled ? (
          <div className="mt-4 space-y-4 border-t border-line pt-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm">
                What it is called on the receipt
                <input
                  type="text"
                  value={taxLabel}
                  onChange={(event) => setTaxLabel(event.target.value)}
                  maxLength={24}
                  placeholder="VAT"
                  className="mt-2 w-full rounded-xl border border-line bg-surface px-3 py-3"
                />
                <span className="mt-1 block text-xs text-muted">
                  Printed exactly as typed — Arabic is fine.
                </span>
              </label>

              <label className="block text-sm">
                Percentage
                <input
                  // decimal, not number: a spinner on a tablet is a way to
                  // nudge the rate by accident, and this field is money
                  type="text"
                  inputMode="decimal"
                  value={taxRate}
                  onChange={(event) => setTaxRate(event.target.value)}
                  placeholder="14"
                  className="mt-2 w-full rounded-xl border border-line bg-surface px-3 py-3"
                />
                <span className="mt-1 block text-xs text-muted">
                  A percentage, so 14 means 14%.
                </span>
              </label>
            </div>

            <label className="block text-sm">
              How your menu prices are written
              <select
                value={taxMode}
                onChange={(event) => setTaxMode(event.target.value as TaxMode)}
                className="mt-2 w-full rounded-xl border border-line bg-surface px-3 py-3"
              >
                <option value="added">
                  Before tax — add it on top of the bill
                </option>
                <option value="included">
                  Already include tax — only show the split
                </option>
              </select>
            </label>

            {/* the part that stops a wrong pick becoming a month of
                overcharging. it is the real function, not a description. */}
            <div className="rounded-xl bg-sunken p-4 text-sm">
              <p className="font-medium">
                On a {formatMoney(EXAMPLE_BILL)} order, the customer pays{" "}
                <span className="font-mono font-semibold">
                  {formatMoney(example.total)}
                </span>
              </p>
              {example.tax > 0 ? (
                <ul className="mt-2 space-y-0.5 font-mono text-xs text-muted">
                  <li>Subtotal {formatMoney(example.subtotal)}</li>
                  <li>
                    {example.label} {example.rate}% {formatMoney(example.tax)}
                  </li>
                  <li>Total {formatMoney(example.total)}</li>
                </ul>
              ) : (
                <p className="mt-2 text-xs text-warn">
                  No rate set yet, so nothing will be charged.
                </p>
              )}
            </div>

            <p className="text-sm text-muted">
              This only affects sales rung from now on. Receipts already printed
              keep the numbers the customer actually paid.
            </p>
          </div>
        ) : null}
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
