"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { RoleShell } from "@/components/role-shell";

const LINKS = [
  { href: "/admin", label: "overview" },
  { href: "/admin/menu", label: "menu" },
  { href: "/admin/inventory", label: "inventory" },
  { href: "/admin/inventory/waste", label: "waste" },
  { href: "/admin/recipes", label: "recipes" },
  { href: "/admin/reports", label: "reports" },
] as const;

type AdminShellProps = {
  title: string;
  children: ReactNode;
};

// admin pages share the same nav under the role header
export function AdminShell({ title, children }: AdminShellProps) {
  const pathname = usePathname();

  return (
    <RoleShell title={title} roleLabel="admin">
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
                  ? "rounded-xl bg-stone-900 px-4 py-2 text-sm text-white"
                  : "rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm text-stone-700"
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
