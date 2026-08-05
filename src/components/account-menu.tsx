"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { PreferencePanel } from "@/components/preference-panel";
import { clearShift, useShift } from "@/lib/auth/shift";
import { getConnection } from "@/lib/connection/use-connection";
import { useTranslate } from "@/lib/i18n/use-language";
import { createClient } from "@/lib/supabase/client";
import { isBilingualPath } from "@/lib/ui/preferences";

// initials for the avatar. two words gives two letters, one word gives one -
// enough for a truck with three staff on the rota.
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) {
    return "7";
  }

  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

type AccountMenuProps = {
  // what the server knows. the shift on the device wins once it loads, because
  // offline that is the only copy there is.
  fallbackName: string;
  roleLabel: string;
};

// top right of every staff screen: who is on the tablet, how it looks, what
// language it speaks, and the way out
export function AccountMenu({ fallbackName, roleLabel }: AccountMenuProps) {
  const router = useRouter();
  const pathname = usePathname();
  const shift = useShift();
  const { t } = useTranslate();

  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const name = shift?.name ?? fallbackName;

  // arabic is a till feature for now, so the switch is not offered on screens
  // that have no arabic to show
  const bilingual = isBilingualPath(pathname);

  useEffect(() => {
    if (!open) {
      return;
    }

    function onPointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  async function signOut() {
    setSigningOut(true);

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
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("account.menuLabel")}
        className="flex items-center gap-3 rounded-full border border-line bg-raised py-1.5 ps-1.5 pe-4 text-start transition-colors hover:border-accent"
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-navy font-mono text-sm font-semibold text-cream dark:bg-saffron dark:text-navy">
          {initialsOf(name)}
        </span>
        <span className="hidden sm:block">
          <span className="block text-sm font-medium leading-tight">{name}</span>
          <span className="block font-mono text-[0.65rem] uppercase tracking-[0.12em] text-muted">
            {roleLabel}
          </span>
        </span>
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute end-0 z-50 mt-2 w-64 overflow-hidden rounded-2xl border border-line bg-raised shadow-xl"
        >
          <div className="border-b border-line px-4 py-3">
            <p className="font-mono text-[0.65rem] uppercase tracking-[0.12em] text-muted">
              {t("account.signedInAs")}
            </p>
            <p className="mt-1 text-sm font-medium">{name}</p>
          </div>

          <PreferencePanel showLanguage={bilingual} />

          <button
            type="button"
            role="menuitem"
            onClick={signOut}
            disabled={signingOut}
            className="w-full px-4 py-3 text-start text-sm font-medium text-danger disabled:opacity-50"
          >
            {t("account.signOut")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
