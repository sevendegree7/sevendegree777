"use client";

import { useTranslate } from "@/lib/i18n/use-language";
import { formatMoney } from "@/lib/pos/money";
import { applyReceiptPageSize } from "@/lib/pos/print-page";
import { formatTruckTime } from "@/lib/pos/receipt";
import type { ShiftReport } from "@/lib/pos/shift-report";
import type { Shift } from "@/types/database.types";

type ShiftReportViewProps = {
  shift: Shift;
  report: ShiftReport;
  onClose: () => void;
};

// the paper that comes off the till at handover.
//
// it carries the receipt-paper class, so it prints on the same roll and at the
// same measured page size as a receipt - one print path, not two. only one copy
// though: this is the sheet that goes in the drawer with the money.
export function ShiftReportView({
  shift,
  report,
  onClose,
}: ShiftReportViewProps) {
  const { t } = useTranslate();

  // short is the case that matters, so it is the one that reads loudest
  const short = report.variance !== null && report.variance < 0;
  const over = report.variance !== null && report.variance > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-navy/60 p-4 print:static print:block print:overflow-visible print:bg-transparent print:p-0">
      <div className="my-auto w-full max-w-sm print:my-0 print:max-w-none">
        <div className="receipt-paper mb-4 rounded-2xl bg-white p-6 font-mono text-sm text-black shadow-lg print:mb-0 print:rounded-none print:shadow-none">
          <div className="text-center">
            <p className="text-base font-semibold tracking-[0.2em]">
              SEVEN | DEGREES
            </p>
            <p className="mt-1 text-xs uppercase tracking-[0.3em]">
              {t("shift.report")}
            </p>
          </div>

          <div className="mt-4 border-y-2 border-black py-3 text-center">
            <p className="text-2xl font-bold leading-tight">
              {shift.opened_by_name}
            </p>
            <p className="mt-1 text-xs">
              {formatTruckTime(shift.opened_at)}
              {shift.closed_at ? ` → ${formatTruckTime(shift.closed_at)}` : ""}
            </p>
          </div>

          <div className="mt-3 space-y-1">
            <Row label={t("shift.orders")} value={String(report.orderCount)} />
            {report.cancelledCount > 0 ? (
              <Row
                label={t("shift.cancelled")}
                value={String(report.cancelledCount)}
              />
            ) : null}
            <Row
              label={t("shift.sales")}
              value={formatMoney(report.salesTotal)}
            />
          </div>

          {report.byPayment.length > 0 ? (
            <div className="mt-3 space-y-1 border-t border-dashed border-neutral-400 pt-3">
              {report.byPayment.map((row) => (
                <Row
                  key={row.key}
                  label={`${row.label} (${row.count})`}
                  value={formatMoney(row.amount)}
                />
              ))}
            </div>
          ) : null}

          {/* only worth the paper when more than one person sold from this
              drawer - otherwise it just repeats the name at the top */}
          {report.byCashier.length > 1 ? (
            <div className="mt-3 border-t border-dashed border-neutral-400 pt-3">
              <p className="mb-1 text-xs uppercase tracking-wide">
                {t("shift.byCashier")}
              </p>
              <div className="space-y-1">
                {report.byCashier.map((row) => (
                  <Row
                    key={row.name}
                    label={`${row.name} (${row.count})`}
                    value={formatMoney(row.amount)}
                  />
                ))}
              </div>
            </div>
          ) : null}

          {/* the drawer. this is the part somebody signs off on. */}
          <div className="mt-3 space-y-1 border-t-2 border-black pt-3">
            <Row
              label={t("shift.float")}
              value={formatMoney(report.openingFloat)}
            />
            <Row
              label={t("shift.cashSales")}
              value={formatMoney(report.cashSales)}
            />
            <div className="flex justify-between border-t border-dashed border-neutral-400 pt-1 font-bold">
              <span>{t("shift.expected")}</span>
              <span>{formatMoney(report.expectedCash)}</span>
            </div>
            <Row
              label={t("shift.counted")}
              value={
                report.countedCash === null
                  ? t("shift.notCounted")
                  : formatMoney(report.countedCash)
              }
            />
          </div>

          {report.variance !== null ? (
            <div className="mt-3 border-t-2 border-black pt-3 text-center">
              {short || over ? (
                <>
                  <p className="text-xs uppercase tracking-[0.2em]">
                    {t("shift.difference")}
                  </p>
                  <p className="text-3xl font-bold leading-tight">
                    {formatMoney(Math.abs(report.variance))}
                  </p>
                  <p className="text-sm font-semibold uppercase">
                    {short ? t("shift.short") : t("shift.over")}
                  </p>
                </>
              ) : (
                <p className="text-base font-bold">{t("shift.balanced")}</p>
              )}
            </div>
          ) : null}

          {shift.closed_by_name &&
          shift.closed_by_name !== shift.opened_by_name ? (
            <p className="mt-3 border-t border-dashed border-neutral-400 pt-2 text-xs">
              {t("shift.closedBy")}: {shift.closed_by_name}
            </p>
          ) : null}

          <div className="mt-6 border-t border-black pt-1 text-center text-[0.6rem] uppercase tracking-wider">
            ________________________
          </div>
        </div>

        <div className="mt-4 flex gap-3 print:hidden">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-line bg-raised px-4 py-3 text-base text-ink"
          >
            {t("receipt.close")}
          </button>
          <button
            type="button"
            onClick={() => {
              applyReceiptPageSize(document);
              window.print();
            }}
            className="flex-[2] rounded-xl bg-navy px-4 py-3 text-base font-semibold text-cream dark:bg-accent-surface dark:text-accent-ink"
          >
            {t("receipt.print")}
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
