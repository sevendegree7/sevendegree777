"use client";

import { useState, useTransition } from "react";

import { useTranslate } from "@/lib/i18n/use-language";
import { formatMoney } from "@/lib/pos/money";
import { formatTruckTime } from "@/lib/pos/receipt";
import type { ShiftReport } from "@/lib/pos/shift-report";
import type { Shift } from "@/types/database.types";

import { closeShift, openShift } from "../shift-actions";
import { ShiftReportView } from "./shift-report-view";

type ShiftBarProps = {
  shift: Shift | null;
  report: ShiftReport | null;
  // sales are not blocked when this is offline - the till keeps selling and the
  // sale attaches to whichever drawer is open when it uploads
  offline: boolean;
  onChanged: (next: { shift: Shift | null; report: ShiftReport | null }) => void;
};

// the drawer, on one line above the menu.
//
// it says who has the till and what is in it, and it is the only place the
// shift is opened or closed. it never blocks a sale: a cashier who forgets to
// open one gets a shift opened for them on their first sale, because a till
// that refuses to sell during a rush is worse than a shift with a zero float.
export function ShiftBar({ shift, report, offline, onChanged }: ShiftBarProps) {
  const { t } = useTranslate();
  const [dialog, setDialog] = useState<"open" | "close" | null>(null);
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [printing, setPrinting] = useState<{
    shift: Shift;
    report: ShiftReport;
  } | null>(null);
  const [busy, startAction] = useTransition();

  function submit(counted: number | null) {
    setError(null);

    startAction(async () => {
      const result =
        dialog === "open"
          ? await openShift(counted ?? 0)
          : await closeShift(counted);

      if (!result.ok) {
        setError(result.message);
        return;
      }

      const closing = dialog === "close";
      setDialog(null);
      setAmount("");

      if (closing) {
        // the report goes up straight away. a shift that closes without the
        // paper coming out is a shift nobody can settle up against.
        setPrinting({ shift: result.summary.shift, report: result.summary.report });
        onChanged({ shift: null, report: null });
        return;
      }

      onChanged({ shift: result.summary.shift, report: result.summary.report });
    });
  }

  // an empty box means zero, not "not counted". skipping the count is its own
  // button, so the two cannot be confused.
  function parsed(): number | null {
    const value = Number(amount.trim() === "" ? "0" : amount.trim());
    return Number.isFinite(value) && value >= 0 ? value : null;
  }

  return (
    <>
      {shift ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-line bg-raised px-4 py-2 text-sm">
          <span className="font-medium">
            {t("shift.openedBy", {
              name: shift.opened_by_name,
              time: formatTruckTime(shift.opened_at).split(", ")[1] ?? "",
            })}
          </span>
          {report ? (
            <span className="text-muted">
              {report.orderCount} · {formatMoney(report.salesTotal)}
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => {
              setDialog("close");
              setAmount("");
              setError(null);
            }}
            disabled={offline}
            className="ms-auto rounded-full border border-line px-3 py-1 disabled:opacity-40"
          >
            {t("shift.close")}
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-warn/15 px-4 py-2 text-sm text-warn">
          <span className="font-medium">{t("shift.none")}</span>
          <button
            type="button"
            onClick={() => {
              setDialog("open");
              setAmount("");
              setError(null);
            }}
            disabled={offline}
            className="ms-auto rounded-full border border-warn px-3 py-1 disabled:opacity-40"
          >
            {t("shift.open")}
          </button>
        </div>
      )}

      {dialog ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/60 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-line bg-raised p-5">
            <h2 className="font-display text-xl font-semibold">
              {dialog === "open" ? t("shift.open") : t("shift.close")}
            </h2>

            {dialog === "close" && report ? (
              <div className="mt-3 rounded-xl bg-sunken p-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted">{t("shift.cashSales")}</span>
                  <span>{formatMoney(report.cashSales)}</span>
                </div>
                <div className="mt-1 flex justify-between font-semibold">
                  <span>{t("shift.expected")}</span>
                  <span>{formatMoney(report.expectedCash)}</span>
                </div>
              </div>
            ) : null}

            <label className="mt-4 block text-sm">
              {dialog === "open"
                ? t("shift.openingFloat")
                : t("shift.countedCash")}
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="0"
                autoFocus
                className="mt-1 w-full rounded-xl border border-line bg-surface px-3 py-3 text-lg"
              />
            </label>
            <p className="mt-1 text-xs text-muted">
              {dialog === "open"
                ? t("shift.openingFloatHint")
                : t("shift.countedCashHint")}
            </p>

            {error ? (
              <p className="mt-3 rounded-xl bg-danger/15 px-3 py-2 text-sm text-danger">
                {error}
              </p>
            ) : null}

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setDialog(null)}
                disabled={busy}
                className="flex-1 rounded-xl border border-line px-4 py-3 text-sm disabled:opacity-50"
              >
                {t("shift.cancel")}
              </button>
              <button
                type="button"
                onClick={() => submit(parsed())}
                disabled={busy || parsed() === null}
                className="flex-[2] rounded-xl bg-navy px-4 py-3 text-sm font-semibold text-cream disabled:opacity-50 dark:bg-accent-surface dark:text-accent-ink"
              >
                {busy
                  ? dialog === "open"
                    ? t("shift.opening")
                    : t("shift.closing")
                  : dialog === "open"
                    ? t("shift.open")
                    : t("shift.close")}
              </button>
              {dialog === "close" ? (
                <button
                  type="button"
                  onClick={() => submit(null)}
                  disabled={busy}
                  className="w-full rounded-xl border border-line px-4 py-2 text-xs text-muted disabled:opacity-50"
                >
                  {t("shift.skipCount")}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {printing ? (
        <ShiftReportView
          shift={printing.shift}
          report={printing.report}
          onClose={() => setPrinting(null)}
        />
      ) : null}
    </>
  );
}
