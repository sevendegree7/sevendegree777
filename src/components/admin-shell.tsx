"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { RoleShell } from "@/components/role-shell";
import { useTranslate } from "@/lib/i18n/use-language";
import type { TranslationKey } from "@/lib/i18n/dictionary";

const LINKS: { href: string; labelKey: TranslationKey }[] = [
  { href: "/admin", labelKey: "admin.nav.overview" },
  { href: "/admin/menu", labelKey: "admin.nav.menu" },
  { href: "/admin/inventory", labelKey: "admin.nav.inventory" },
  { href: "/admin/inventory/waste", labelKey: "admin.nav.waste" },
  { href: "/admin/recipes", labelKey: "admin.nav.recipes" },
  { href: "/admin/reports", labelKey: "admin.nav.reports" },
  { href: "/admin/orders", labelKey: "admin.nav.orders" },
  { href: "/admin/debts", labelKey: "admin.nav.debts" },
  { href: "/admin/users", labelKey: "admin.nav.staff" },
  { href: "/admin/settings", labelKey: "admin.nav.settings" },
];

type AdminShellProps = {
  title?: string;
  titleKey?: TranslationKey;
  children: ReactNode;
};

// admin pages share the same nav under the role header
export function AdminShell({ title, titleKey, children }: AdminShellProps) {
  const pathname = usePathname();
  const { t } = useTranslate();
  const heading = titleKey ? t(titleKey) : (title ?? t("admin.nav.overview"));

  return (
    <RoleShell title={heading} roleLabel={t("admin.role")}>
      <nav className="sticky top-0 z-20 -mx-4 mb-6 flex gap-2 overflow-x-auto border-b border-line bg-surface px-4 py-3 [scrollbar-width:none] sm:-mx-6 sm:px-6 [&::-webkit-scrollbar]:hidden">
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
                  ? "shrink-0 rounded-xl bg-navy px-4 py-2.5 text-sm font-medium text-cream dark:bg-accent-surface dark:text-accent-ink"
                  : "shrink-0 rounded-xl border border-line bg-raised px-4 py-2.5 text-sm text-muted hover:text-ink"
              }
            >
              {t(link.labelKey)}
            </Link>
          );
        })}
      </nav>
      {children}
    </RoleShell>
  );
}
