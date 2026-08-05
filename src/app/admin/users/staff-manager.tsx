"use client";

import { useState, useTransition } from "react";

import {
  createStaffAccount,
  setStaffActive,
} from "@/app/admin/actions";
import type { UserRole } from "@/types/database.types";

export type StaffRow = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
};

export function StaffManager({ staff }: { staff: StaffRow[] }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("cashier");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function create() {
    setMessage(null);
    startTransition(async () => {
      const result = await createStaffAccount({ name, email, password, role });
      setMessage(result.ok ? result.message ?? "created" : result.message);
      if (result.ok) {
        setName("");
        setEmail("");
        setPassword("");
      }
    });
  }

  function toggle(userId: string, active: boolean) {
    setMessage(null);
    startTransition(async () => {
      const result = await setStaffActive({ userId, active });
      setMessage(result.ok ? result.message ?? "updated" : result.message);
    });
  }

  return (
    <div className="space-y-6">
      <section className="max-w-2xl rounded-2xl bg-raised p-5 shadow-sm">
        <h2 className="text-lg font-medium">Create staff account</h2>
        <p className="mt-1 text-sm text-muted">
          Use one cashier account per person so reports can identify who rang
          each sale.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            Name
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="mt-1 w-full rounded-xl border border-line px-3 py-2"
            />
          </label>
          <label className="text-sm">
            Role
            <select
              value={role}
              onChange={(event) => setRole(event.target.value as UserRole)}
              className="mt-1 w-full rounded-xl border border-line px-3 py-2"
            >
              <option value="cashier">Cashier</option>
              <option value="kitchen">Kitchen</option>
              <option value="admin">Admin</option>
            </select>
          </label>
          <label className="text-sm">
            Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-1 w-full rounded-xl border border-line px-3 py-2"
            />
          </label>
          <label className="text-sm">
            Temporary password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-1 w-full rounded-xl border border-line px-3 py-2"
            />
          </label>
        </div>

        <button
          type="button"
          disabled={pending}
          onClick={create}
          className="mt-4 rounded-xl bg-navy dark:bg-accent-surface dark:text-accent-ink px-4 py-3 text-cream disabled:opacity-50"
        >
          {pending ? "Working..." : "Create account"}
        </button>
      </section>

      <section className="rounded-2xl bg-raised p-5 shadow-sm">
        <h2 className="text-lg font-medium">Staff accounts</h2>
        <ul className="mt-3 divide-y divide-line">
          {staff.map((person) => (
            <li
              key={person.id}
              className="flex flex-wrap items-center justify-between gap-3 py-3"
            >
              <div>
                <p className="font-medium">{person.name}</p>
                <p className="text-sm text-muted">
                  {person.email} · {person.role}
                </p>
              </div>
              <button
                type="button"
                disabled={pending}
                onClick={() => toggle(person.id, !person.isActive)}
                className={
                  person.isActive
                    ? "rounded-xl border border-danger px-3 py-2 text-sm text-danger"
                    : "rounded-xl border border-ok px-3 py-2 text-sm text-ok"
                }
              >
                {person.isActive ? "disable" : "enable"}
              </button>
            </li>
          ))}
        </ul>
      </section>

      {message ? <p className="text-sm text-muted">{message}</p> : null}
    </div>
  );
}
