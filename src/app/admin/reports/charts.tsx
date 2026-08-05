"use client";

import { formatMoney } from "@/lib/pos/money";
import type { NamedAmount } from "@/lib/reports/analytics";

type BarChartProps = {
  title: string;
  rows: NamedAmount[];
  emptyText?: string;
  showCount?: boolean;
};

// simple brand bars. no chart library, so the tablet stays light offline.
export function HorizontalBars({
  title,
  rows,
  emptyText = "No data yet",
  showCount = false,
}: BarChartProps) {
  const max = Math.max(...rows.map((row) => row.amount), 0);

  return (
    <section className="rounded-2xl border border-line bg-raised p-5">
      <h2 className="font-display text-lg font-semibold">{title}</h2>
      {rows.length === 0 || max === 0 ? (
        <p className="mt-3 text-sm text-muted">{emptyText}</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {rows.map((row) => {
            const width = max === 0 ? 0 : Math.round((row.amount / max) * 100);

            return (
              <li key={row.key}>
                <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                  <span className="font-medium capitalize">{row.label}</span>
                  <span className="font-mono text-muted">
                    {formatMoney(row.amount)}
                    {showCount && row.count !== undefined
                      ? ` · ${row.count}`
                      : ""}
                  </span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-sunken">
                  <div
                    className="h-full rounded-full bg-accent-surface"
                    style={{ width: `${width}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export function VerticalBars({
  title,
  rows,
  emptyText = "No data yet",
}: BarChartProps) {
  const max = Math.max(...rows.map((row) => row.amount), 0);
  const visible = rows.filter((row) => row.amount > 0);
  const chartRows = visible.length > 0 ? rows : [];

  return (
    <section className="rounded-2xl border border-line bg-raised p-5">
      <h2 className="font-display text-lg font-semibold">{title}</h2>
      {chartRows.length === 0 || max === 0 ? (
        <p className="mt-3 text-sm text-muted">{emptyText}</p>
      ) : (
        <div className="mt-5 flex h-48 items-end gap-1 overflow-x-auto pb-1">
          {chartRows.map((row) => {
            const height =
              max === 0 ? 0 : Math.max(4, Math.round((row.amount / max) * 100));

            return (
              <div
                key={row.key}
                className="flex min-w-8 flex-1 flex-col items-center gap-2"
                title={`${row.label}: ${formatMoney(row.amount)}`}
              >
                <div className="flex h-36 w-full items-end justify-center">
                  <div
                    className="w-full max-w-8 rounded-t-md bg-navy dark:bg-accent-surface"
                    style={{ height: `${height}%` }}
                  />
                </div>
                <span className="font-mono text-[0.6rem] text-muted">
                  {row.label.length > 6 ? row.label.slice(5) : row.label}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

export function HourBars({
  title,
  rows,
}: {
  title: string;
  rows: NamedAmount[];
}) {
  const max = Math.max(...rows.map((row) => row.amount), 0);
  const busy = rows.filter((row) => (row.count ?? 0) > 0);

  return (
    <section className="rounded-2xl border border-line bg-raised p-5">
      <h2 className="font-display text-lg font-semibold">{title}</h2>
      {busy.length === 0 ? (
        <p className="mt-3 text-sm text-muted">No sales in this period yet</p>
      ) : (
        <>
          <div className="mt-5 flex h-40 items-end gap-0.5">
            {rows.map((row) => {
              const height =
                max === 0
                  ? 0
                  : Math.max(row.amount > 0 ? 6 : 0, Math.round((row.amount / max) * 100));

              return (
                <div
                  key={row.key}
                  className="flex flex-1 flex-col items-center justify-end"
                  title={`${row.label}: ${formatMoney(row.amount)} (${row.count ?? 0} orders)`}
                >
                  <div
                    className={`w-full rounded-t-sm ${
                      row.amount > 0 ? "bg-accent-surface" : "bg-transparent"
                    }`}
                    style={{ height: `${height}%` }}
                  />
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex justify-between font-mono text-[0.65rem] text-muted">
            <span>00</span>
            <span>06</span>
            <span>12</span>
            <span>18</span>
            <span>23</span>
          </div>
        </>
      )}
    </section>
  );
}
