"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";

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
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <main className="min-h-screen bg-stone-100 text-stone-900">
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
