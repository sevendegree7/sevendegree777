"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";

import { ShiftKeeper } from "@/components/shift-keeper";
import { clearShift } from "@/lib/auth/shift";
import { getConnection } from "@/lib/connection/use-connection";
import { createClient } from "@/lib/supabase/client";

type RoleShellProps = {
  title: string;
  roleLabel: string;
  children?: ReactNode;
};

// simple shared header for role home screens in phase 1
export function RoleShell({ title, roleLabel, children }: RoleShellProps) {
  const router = useRouter();

  async function signOut() {
    const supabase = createClient();

    try {
      // offline there is nobody to tell, so drop the session on the device and
      // skip the round trip. closing a shift is not something to refuse
      // because the truck moved out of range.
      await supabase.auth.signOut(
        getConnection() === "offline" ? { scope: "local" } : undefined,
      );
    } catch {
      // the call itself failed. the tablet is still being handed over.
    }

    // whatever happened above, this tablet is no longer open as anybody
    clearShift();

    router.replace("/login");
    router.refresh();
  }

  return (
    <main className="min-h-screen bg-stone-100 text-stone-900">
      <ShiftKeeper />
      <header className="flex items-center justify-between border-b border-stone-200 bg-white px-6 py-4">
        <div>
          <p className="text-sm text-stone-500">seven degree · {roleLabel}</p>
          <h1 className="text-2xl font-semibold">{title}</h1>
        </div>
        <button
          type="button"
          onClick={signOut}
          className="rounded-xl border border-stone-300 px-4 py-2 text-sm"
        >
          sign out
        </button>
      </header>
      <section className="px-6 py-8">{children}</section>
    </main>
  );
}
