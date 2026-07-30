import { RoleShell } from "@/components/role-shell";

// admin home - full dashboard comes in phase 3
export default function AdminPage() {
  return (
    <RoleShell title="admin dashboard" roleLabel="admin">
      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="text-xl font-medium">admin screen ready</h2>
        <p className="mt-2 max-w-xl text-stone-600">
          phase 1 only checks login and role redirect. next we add menu control,
          inventory, waste logs, and sales reports here.
        </p>
      </div>
    </RoleShell>
  );
}
