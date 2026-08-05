"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { BrandMark } from "@/components/brand-mark";
import { PreferencesMenu } from "@/components/preferences-menu";
import { ROLE_HOME, ROLE_OFFLINE_HOME, isUserRole } from "@/lib/auth/roles";
import { clearShift, saveShift, useShift } from "@/lib/auth/shift";
import {
  checkConnection,
  useConnection,
} from "@/lib/connection/use-connection";
import { useUnsyncedSales } from "@/lib/data/use-unsynced-sales";
import { useTranslate } from "@/lib/i18n/use-language";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const connection = useConnection();
  const shift = useShift();
  const waitingSales = useUnsyncedSales();
  const { t } = useTranslate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // signing in is a request to supabase. with no line to supabase there is
  // nothing to type into this form that could work, so the tablet's own note
  // of the shift takes over.
  const offline = connection === "offline";

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();

    const { data: authData, error: authError } =
      await supabase.auth.signInWithPassword({
        email,
        password,
      });

    if (authError || !authData.user) {
      setError(authError?.message ?? t("login.failed"));
      setLoading(false);
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("name, role, is_active")
      .eq("id", authData.user.id)
      .maybeSingle();

    if (
      profileError ||
      !profile ||
      !profile.is_active ||
      !isUserRole(profile.role)
    ) {
      clearShift();
      setError(t("login.noRole"));
      setLoading(false);
      return;
    }

    // the shift is open on this tablet now. writing it down here is what lets
    // the same tablet open tomorrow morning with no internet.
    saveShift({
      userId: authData.user.id,
      name: profile.name,
      role: profile.role,
      savedAt: new Date().toISOString(),
    });

    router.replace(ROLE_HOME[profile.role]);
    router.refresh();
  }

  function continueOffline() {
    if (!shift) {
      return;
    }

    // a plain document load. a client navigation would ask the server for a
    // payload that is not coming; this one the service worker can answer from
    // the copy it kept.
    window.location.assign(ROLE_OFFLINE_HOME[shift.role]);
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-surface px-4 py-10">
      {/* the engraved hatch from the pattern library, kept faint enough to
          read as texture rather than stripes */}
      <div
        aria-hidden
        className="brand-hatch pointer-events-none absolute inset-0 opacity-40"
      />

      <div className="absolute end-4 top-4 z-10">
        <PreferencesMenu />
      </div>

      <div className="relative w-full max-w-md rounded-2xl border border-line bg-raised p-8 shadow-sm">
        <div className="text-center">
          <BrandMark size="xl" className="mx-auto" />
          <p className="mt-3 font-mono text-[0.65rem] uppercase tracking-[0.22em] text-muted">
            Seven Degrees
          </p>
          <p className="font-accent mt-1 text-base text-accent">
            {t("brand.tagline")}
          </p>
        </div>

        <div className="my-6 h-px bg-line" />

        {offline ? (
          <>
            <h1 className="font-display text-3xl font-semibold">
              {t("login.noInternet")}
            </h1>

            {shift ? (
              <>
                <p className="mt-2 text-sm text-muted">
                  {t("login.openAs", { name: shift.name, role: shift.role })}
                </p>

                <button
                  type="button"
                  onClick={continueOffline}
                  className="mt-8 w-full rounded-xl bg-navy px-4 py-3 text-base font-semibold text-cream dark:bg-accent-surface dark:text-accent-ink"
                >
                  {t("login.continueAs", { name: shift.name })}
                </button>

                <p className="mt-4 text-sm text-muted">
                  {t("login.cashOnlyNote")}
                </p>
                <p className="mt-2 text-xs text-muted">
                  {t("login.lastChecked", {
                    time: new Date(shift.savedAt).toLocaleString(),
                  })}
                </p>
              </>
            ) : (
              <p className="mt-2 text-sm text-muted">
                {t("login.needsInternet")}
              </p>
            )}

            <button
              type="button"
              onClick={() => void checkConnection()}
              className="mt-6 w-full rounded-xl border border-line px-4 py-3 text-base"
            >
              {t("connection.checkAgain")}
            </button>
          </>
        ) : (
          <form onSubmit={onSubmit}>
            <h1 className="font-display text-3xl font-semibold">
              {t("login.title")}
            </h1>
            <p className="mt-2 text-sm text-muted">{t("login.roleHint")}</p>

            <label className="mt-8 block text-sm text-muted">
              {t("login.email")}
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                dir="ltr"
                className="mt-2 w-full rounded-xl border border-line bg-surface px-4 py-3 text-base text-ink outline-none focus:border-accent"
                autoComplete="email"
              />
            </label>

            <label className="mt-4 block text-sm text-muted">
              {t("login.password")}
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                dir="ltr"
                className="mt-2 w-full rounded-xl border border-line bg-surface px-4 py-3 text-base text-ink outline-none focus:border-accent"
                autoComplete="current-password"
              />
            </label>

            {error ? (
              <p className="mt-4 text-sm text-danger">{error}</p>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="mt-6 w-full rounded-xl bg-navy px-4 py-3 text-base font-semibold text-cream disabled:opacity-60 dark:bg-accent-surface dark:text-accent-ink"
            >
              {loading ? t("login.signingIn") : t("login.signIn")}
            </button>
          </form>
        )}

        {/* money the shop has taken that the books have not seen yet. whoever
            is standing at this screen is the person who can get it up. */}
        {waitingSales > 0 ? (
          <p className="mt-6 rounded-xl bg-warn/15 px-4 py-3 text-sm text-warn">
            {waitingSales === 1
              ? t("login.oneWaiting")
              : t("login.manyWaiting", { count: waitingSales })}{" "}
            {offline
              ? t("login.uploadsWhenBack")
              : t("login.openTillToSend")}
          </p>
        ) : null}
      </div>
    </main>
  );
}
