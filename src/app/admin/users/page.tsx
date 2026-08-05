import { redirect } from "next/navigation";

import { AdminShell } from "@/components/admin-shell";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/types/database.types";

import { StaffManager, type StaffRow } from "./staff-manager";

export default async function AdminUsersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: currentProfile } = await supabase
    .from("profiles")
    .select("role, is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (
    !currentProfile ||
    !currentProfile.is_active ||
    currentProfile.role !== "admin"
  ) {
    redirect("/login");
  }

  let staff: StaffRow[] = [];
  let error: string | null = null;

  try {
    const admin = createAdminClient();
    const [profilesResult, usersResult] = await Promise.all([
      admin.from("profiles").select("*").order("name"),
      admin.auth.admin.listUsers({ page: 1, perPage: 100 }),
    ]);

    if (profilesResult.error) throw profilesResult.error;
    if (usersResult.error) throw usersResult.error;

    const emailById = new Map(
      usersResult.data.users.map((user) => [user.id, user.email ?? "no email"]),
    );

    staff = ((profilesResult.data ?? []) as Profile[]).map((profile) => ({
      id: profile.id,
      name: profile.name,
      email: emailById.get(profile.id) ?? "auth user not found",
      role: profile.role,
      isActive: profile.is_active,
    }));
  } catch (caught) {
    error = caught instanceof Error ? caught.message : "could not load staff";
  }

  return (
    <AdminShell title="Staff accounts">
      {error ? (
        <p className="mb-4 rounded-xl bg-warn/15 p-4 text-sm text-warn">
          {error}. add SUPABASE_SERVICE_ROLE_KEY to local and Vercel server
          environment variables.
        </p>
      ) : null}
      <StaffManager staff={staff} />
    </AdminShell>
  );
}
