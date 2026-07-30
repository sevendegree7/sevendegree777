import { RoleShell } from "@/components/role-shell";

// kitchen home - realtime kds comes in phase 2
export default function KdsPage() {
  return (
    <RoleShell title="kitchen display" roleLabel="kitchen">
      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="text-xl font-medium">kitchen screen ready</h2>
        <p className="mt-2 max-w-xl text-stone-600">
          phase 1 only checks login and role redirect. next this page will show
          live orders and status buttons for the kitchen.
        </p>
      </div>
    </RoleShell>
  );
}
