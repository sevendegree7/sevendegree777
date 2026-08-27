import { AdminShell } from "@/components/admin-shell";
import { formatMoney } from "@/lib/pos/money";
import { formatTruckTime } from "@/lib/pos/receipt";
import { ticketNumber } from "@/lib/kds/orders";
import { createClient } from "@/lib/supabase/server";

import { SettleDebtForm } from "./settle-form";

// open agel debts. cashier rings them; only admin marks them paid.
export default async function AdminDebtsPage() {
  const supabase = await createClient();

  const { data: debts, error } = await supabase
    .from("orders")
    .select(
      "id, total_amount, customer_name, customer_phone, created_at, created_by_name, ticket_date, ticket_number, notes",
    )
    .eq("payment_method", "agel")
    .is("agel_settled_at", null)
    .neq("status", "cancelled")
    .order("created_at", { ascending: true });

  const list = debts ?? [];
  const owed = list.reduce((sum, row) => sum + Number(row.total_amount), 0);

  return (
    <AdminShell title="Agel debts">
      <p className="mb-4 max-w-2xl text-sm text-muted">
        Sales rung as agel (pay later). Collect the money, then settle with
        cash, card or instapay. Cashiers can create these; only admin settles.
      </p>

      {error ? (
        <p className="text-danger">{error.message}</p>
      ) : list.length === 0 ? (
        <p className="rounded-2xl border border-line bg-raised p-6 text-sm text-muted">
          No open agel debts.
        </p>
      ) : (
        <div className="space-y-4">
          <div className="rounded-2xl border border-line bg-raised p-5">
            <p className="text-sm text-muted">Still owed</p>
            <p className="mt-1 font-display text-3xl font-semibold">
              {formatMoney(owed)}
            </p>
            <p className="mt-1 text-sm text-muted">
              {list.length} open ticket{list.length === 1 ? "" : "s"}
            </p>
          </div>

          <ul className="space-y-3">
            {list.map((debt) => (
              <li
                key={debt.id}
                className="rounded-2xl border border-line bg-raised p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-sm text-muted">
                      #{ticketNumber(debt)} · {formatTruckTime(debt.created_at)}
                    </p>
                    <p className="mt-1 text-lg font-semibold capitalize">
                      {debt.customer_name ?? "No name"}
                    </p>
                    {debt.customer_phone ? (
                      <p className="font-mono text-sm text-muted" dir="ltr">
                        {debt.customer_phone}
                      </p>
                    ) : null}
                    {debt.created_by_name ? (
                      <p className="mt-1 text-sm text-muted">
                        By {debt.created_by_name}
                      </p>
                    ) : null}
                    {debt.notes ? (
                      <p className="mt-1 text-sm text-muted">{debt.notes}</p>
                    ) : null}
                  </div>
                  <p className="font-mono text-2xl font-semibold">
                    {formatMoney(Number(debt.total_amount))}
                  </p>
                </div>

                <div className="mt-4">
                  <SettleDebtForm orderId={debt.id} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </AdminShell>
  );
}
