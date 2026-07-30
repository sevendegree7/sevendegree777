"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { ROLE_HOME, isUserRole } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
      .select("role")
      .eq("id", authData.user.id)
      .maybeSingle();

    if (profileError || !profile || !isUserRole(profile.role)) {
      setError("no role found for this account. ask admin to set your profile.");
      setLoading(false);
      return;
    }

    router.replace(ROLE_HOME[profile.role]);
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-100 px-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-md rounded-2xl bg-white p-8 shadow-sm"
      >
        <p className="text-sm tracking-wide text-stone-500">seven degree</p>
        <h1 className="mt-2 text-3xl font-semibold text-stone-900">sign in</h1>
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

        {error ? (
          <p className="mt-4 text-sm text-red-600">{error}</p>
        ) : null}

        <button
          type="submit"
          disabled={loading}
          className="mt-6 w-full rounded-xl bg-stone-900 px-4 py-3 text-base font-medium text-white disabled:opacity-60"
        >
          {loading ? "signing in..." : "sign in"}
        </button>
      </form>
    </main>
  );
}
