"use client";

import type { ReactNode } from "react";

import { AccountMenu } from "@/components/account-menu";
import { BrandMark } from "@/components/brand-mark";
import { ShiftKeeper } from "@/components/shift-keeper";

type RoleShellProps = {
  title: string;
  roleLabel: string;
  children?: ReactNode;
};

// shared frame for the till and the kitchen board
export function RoleShell({ title, roleLabel, children }: RoleShellProps) {
  return (
    <main className="min-h-screen bg-surface text-ink">
      <ShiftKeeper />

      <header className="flex items-center justify-between gap-4 border-b border-line bg-raised px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3 sm:gap-4">
          <BrandMark size="sm" />

          <div className="border-s border-line ps-3 sm:ps-4">
            <p className="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-muted">
              Seven Degrees / {roleLabel}
            </p>
            <h1 className="font-display text-xl font-semibold leading-tight sm:text-2xl">
              {title}
            </h1>
          </div>
        </div>

        <AccountMenu fallbackName={roleLabel} roleLabel={roleLabel} />
      </header>

      <section className="px-4 py-6 sm:px-6 sm:py-8">{children}</section>
    </main>
  );
}
