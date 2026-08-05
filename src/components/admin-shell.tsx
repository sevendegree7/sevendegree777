"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { RoleShell } from "@/components/role-shell";

const LINKS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/menu", label: "Menu" },
  { href: "/admin/inventory", label: "Inventory" },
  { href: "/admin/inventory/waste", label: "Waste" },
  { href: "/admin/recipes", label: "Recipes" },
  { href: "/admin/reports", label: "Reports" },
  { href: "/admin/users", label: "Staff" },
  { href: "/admin/settings", label: "Settings" },
] as const;

type AdminShellProps = {
  title: string;
  children: ReactNode;
};

// admin pages share the same nav under the role header
export function AdminShell({ title, children }: AdminShellProps) {
  const pathname = usePathname();

  return (
    <RoleShell title={title} roleLabel="Admin">
      <nav className="mb-6 flex flex-wrap gap-2">
        {LINKS.map((link) => {
          const active =
            link.href === "/admin"
              ? pathname === "/admin"
              : link.href === "/admin/inventory"
                ? pathname === "/admin/inventory"
                : pathname === link.href ||
                  pathname.startsWith(`${link.href}/`);

          return (
            <Link
              key={link.href}
              href={link.href}
              className={
                active
                  ? "rounded-xl bg-navy px-4 py-2 text-sm font-medium text-cream dark:bg-accent-surface dark:text-accent-ink"
                  : "rounded-xl border border-line bg-raised px-4 py-2 text-sm text-muted hover:text-ink"
              }
            >
              {link.label}
            </Link>
          );
        })}
      </nav>
      {children}
    </RoleShell>
  );
}
