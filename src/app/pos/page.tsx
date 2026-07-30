import { RoleShell } from "@/components/role-shell";

// cashier home - real pos comes in phase 2
export default function PosPage() {
  return (
    <RoleShell title="pos" roleLabel="cashier">
      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="text-xl font-medium">cashier screen ready</h2>
        <p className="mt-2 max-w-xl text-stone-600">
          phase 1 only checks login and role redirect. next we build the product
          grid, cart, payments, and sending orders to the kitchen.
        </p>
      </div>
    </RoleShell>
  );
}
