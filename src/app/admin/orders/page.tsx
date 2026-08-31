import Link from "next/link";

import { AdminShell } from "@/components/admin-shell";
import { fetchAdminOrders } from "@/lib/kds/queries";
import {
  startOfTruckDayIso,
  truckDateRange,
  truckDayKey,
} from "@/lib/reports/dates";
import { createClient } from "@/lib/supabase/server";
import type { OrderStatus } from "@/types/database.types";

import { OrdersPanel } from "./orders-panel";

const PERIODS = ["today", "7", "30", "90", "all"] as const;
const STATUSES: Array<OrderStatus | ""> = [
  "",
  "completed",
  "pending",
  "preparing",
  "ready",
  "cancelled",
];

function periodDays(period: string): number {
  if (period === "today") return 0;
  if (period === "7") return 7;
  if (period === "30") return 30;
  if (period === "90") return 90;
  return 3650;
}

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{
    period?: string;
    from?: string;
    to?: string;
    status?: string;
    cashier?: string;
  }>;
}) {
  const params = await searchParams;
  const selectedCashier = params.cashier ?? "";
  const selectedStatus = STATUSES.includes(params.status as OrderStatus | "")
    ? (params.status as OrderStatus | "")
    : "";
  const range = truckDateRange(params.from, params.to);
  const period = range
    ? "custom"
    : PERIODS.includes(params.period as (typeof PERIODS)[number])
      ? (params.period as string)
      : "90";
  const since =
    range?.since ??
    (period === "all"
      ? "2020-01-01T00:00:00.000Z"
      : startOfTruckDayIso(periodDays(period)));

  const supabase = await createClient();

  const [{ orders, error }, { data: cashiers }, { count: totalInRange }] =
    await Promise.all([
      fetchAdminOrders(supabase, {
        sinceIso: since,
        untilIso: range?.until,
        status: selectedStatus || undefined,
        cashierId: selectedCashier || undefined,
        limit: 200,
      }),
      supabase
        .from("profiles")
        .select("id, name, is_active")
        .in("role", ["cashier", "admin"])
        .order("name"),
      (() => {
        let query = supabase
          .from("orders")
          .select("id", { count: "exact", head: true })
          .gte("created_at", since);
        if (range?.until) query = query.lt("created_at", range.until);
        if (selectedStatus) query = query.eq("status", selectedStatus);
        if (selectedCashier) query = query.eq("created_by", selectedCashier);
        return query;
      })(),
    ]);

  const shown = orders.length;
  const total = totalInRange ?? shown;

  return (
    <AdminShell title="Orders">
      <p className="mb-4 max-w-2xl text-sm text-muted">
        Every sale in the system. Cancel mistakes here (stock returns when
        possible). To edit a ticket into a new sale, use order history on the
        till while signed in as admin.
      </p>

      <form className="print-hide mb-6 grid max-w-4xl gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted">Period</span>
          <select
            name="period"
            defaultValue={period}
            className="rounded-xl border border-line bg-raised px-3 py-2"
          >
            <option value="today">Today</option>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            <option value="all">All time</option>
            <option value="custom" disabled>
              Custom (use dates below)
            </option>
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted">Status</span>
          <select
            name="status"
            defaultValue={selectedStatus}
            className="rounded-xl border border-line bg-raised px-3 py-2"
          >
            <option value="">All</option>
            {STATUSES.filter(Boolean).map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted">Cashier</span>
          <select
            name="cashier"
            defaultValue={selectedCashier}
            className="rounded-xl border border-line bg-raised px-3 py-2"
          >
            <option value="">All</option>
            {(cashiers ?? []).map((cashier) => (
              <option key={cashier.id} value={cashier.id}>
                {cashier.name}
                {!cashier.is_active ? " (off)" : ""}
              </option>
            ))}
          </select>
        </label>

        <button
          type="submit"
          className="rounded-xl bg-navy px-4 py-2.5 text-sm font-medium text-cream dark:bg-accent-surface dark:text-accent-ink"
        >
          Filter
        </button>

        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          <span className="text-muted">From (truck day)</span>
          <input
            type="date"
            name="from"
            defaultValue={params.from ?? ""}
            max={truckDayKey(new Date())}
            className="rounded-xl border border-line bg-raised px-3 py-2"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          <span className="text-muted">To (truck day)</span>
          <input
            type="date"
            name="to"
            defaultValue={params.to ?? ""}
            max={truckDayKey(new Date())}
            className="rounded-xl border border-line bg-raised px-3 py-2"
          />
        </label>
      </form>

      {range ? (
        <p className="mb-4 text-sm text-muted">
          Custom range: {params.from} → {params.to}
        </p>
      ) : null}

      {error ? (
        <p className="mb-4 text-danger">{error}</p>
      ) : (
        <p className="mb-4 text-sm text-muted">
          Showing {shown} of {total} ticket{total === 1 ? "" : "s"}
          {shown < total ? " (newest 200)" : ""}.{" "}
          <Link href="/admin/reports" className="underline">
            Reports
          </Link>{" "}
          for totals.
        </p>
      )}

      <OrdersPanel orders={orders} />
    </AdminShell>
  );
}
