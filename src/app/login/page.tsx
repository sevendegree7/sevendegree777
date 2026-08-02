"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { ROLE_HOME, ROLE_OFFLINE_HOME, isUserRole } from "@/lib/auth/roles";
import { saveShift, useShift } from "@/lib/auth/shift";
import { checkConnection, useConnection } from "@/lib/connection/use-connection";
import { useUnsyncedSales } from "@/lib/data/use-unsynced-sales";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const connection = useConnection();
  const shift = useShift();
  const waitingSales = useUnsyncedSales();
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
      setError(authError?.message ?? "login failed");
      setLoading(false);
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("name, role")
      .eq("id", authData.user.id)
      .maybeSingle();

    if (profileError || !profile || !isUserRole(profile.role)) {
      setError("no role found for this account. ask admin to set your profile.");
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
    <main className="flex min-h-screen items-center justify-center bg-stone-100 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-sm">
        <p className="text-sm tracking-wide text-stone-500">seven degree</p>

        {offline ? (
          <>
            <h1 className="mt-2 text-3xl font-semibold text-stone-900">
              no internet
            </h1>

            {shift ? (
              <>
                <p className="mt-2 text-sm text-stone-600">
                  this tablet is open as {shift.name} · {shift.role}. carry on
                  without signing in again.
                </p>

                <button
                  type="button"
                  onClick={continueOffline}
                  className="mt-8 w-full rounded-xl bg-stone-900 px-4 py-3 text-base font-medium text-white"
                >
                  continue as {shift.name}
                </button>

                <p className="mt-4 text-sm text-stone-600">
                  cash only, and every sale is kept on the tablet until the
                  internet is back.
                </p>
                <p className="mt-2 text-xs text-stone-500">
                  shift last checked with the server{" "}
                  {new Date(shift.savedAt).toLocaleString()}
                </p>
              </>
            ) : (
              <p className="mt-2 text-sm text-stone-600">
                signing in needs the internet, and this tablet has no shift on
                it. connect once and sign in - after that it opens on its own,
                internet or not.
              </p>
            )}

            <button
              type="button"
              onClick={() => void checkConnection()}
              className="mt-6 w-full rounded-xl border border-stone-300 px-4 py-3 text-base"
            >
              check again
            </button>
          </>
        ) : (
          <form onSubmit={onSubmit}>
            <h1 className="mt-2 text-3xl font-semibold text-stone-900">
              sign in
            </h1>
            <p className="mt-2 text-sm text-stone-600">
              admin goes to dashboard, cashier to pos, kitchen to kds
            </p>

            <label className="mt-8 block text-sm text-stone-700">
              email
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-2 w-full rounded-xl border border-stone-300 px-4 py-3 text-base outline-none focus:border-stone-800"
                autoComplete="email"
              />
            </label>

            <label className="mt-4 block text-sm text-stone-700">
              password
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-2 w-full rounded-xl border border-stone-300 px-4 py-3 text-base outline-none focus:border-stone-800"
                autoComplete="current-password"
              />
            </label>

            {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

            <button
              type="submit"
              disabled={loading}
              className="mt-6 w-full rounded-xl bg-stone-900 px-4 py-3 text-base font-medium text-white disabled:opacity-60"
            >
              {loading ? "signing in..." : "sign in"}
            </button>
          </form>
        )}

        {/* money the shop has taken that the books have not seen yet. whoever
            is standing at this screen is the person who can get it up. */}
        {waitingSales > 0 ? (
          <p className="mt-6 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {waitingSales} {waitingSales === 1 ? "sale is" : "sales are"} still
            waiting on this tablet.{" "}
            {offline
              ? "they upload when the internet is back."
              : "open the till to send them up."}
          </p>
        ) : null}
      </div>
    </main>
  );
}
