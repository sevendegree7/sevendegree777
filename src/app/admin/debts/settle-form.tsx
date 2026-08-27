"use client";

import { useState, useTransition } from "react";

import { settleAgelDebt } from "@/app/admin/actions";

export function SettleDebtForm({ orderId }: { orderId: string }) {
  const [method, setMethod] = useState<"cash" | "card" | "instapay">("cash");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        setMessage(null);
        start(async () => {
          const result = await settleAgelDebt({
            orderId,
            paymentMethod: method,
          });
          setMessage(result.message ?? (result.ok ? "settled" : "failed"));
        });
      }}
    >
      <label className="text-sm">
        Collect as
        <select
          value={method}
          onChange={(event) =>
            setMethod(event.target.value as "cash" | "card" | "instapay")
          }
          className="mt-1 block rounded-xl border border-line bg-surface px-3 py-2"
        >
          <option value="cash">Cash</option>
          <option value="card">Card</option>
          <option value="instapay">InstaPay</option>
        </select>
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-navy px-4 py-2.5 text-sm font-semibold text-cream disabled:opacity-50 dark:bg-accent-surface dark:text-accent-ink"
      >
        {pending ? "Saving..." : "Mark paid"}
      </button>
      {message ? <p className="text-sm text-muted">{message}</p> : null}
    </form>
  );
}
