"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import {
  addStaff,
  removeStaff,
  resendInvite,
  setStaffRole,
  type StaffRole,
} from "./staff-actions";

export type StaffMember = {
  email: string;
  role: string; // 'owner' | 'admin' | 'member'
  joined: boolean;
};

const MASTER_EMAIL = "content@digitalnicheagency.com";

// We surface two practical tiers in the UI. 'admin' (if it ever exists in the
// DB) is shown as a team member.
const ROLE_OPTIONS: { value: StaffRole; label: string }[] = [
  { value: "member", label: "Team member" },
  { value: "owner", label: "Owner (full control)" },
];

function roleLabel(role: string) {
  return role === "owner" ? "Owner (full control)" : "Team member";
}

export default function StaffClient({ staff }: { staff: StaffMember[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const refresh = () => router.refresh();

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<StaffRole>("member");
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!email.trim()) return;
    setBusy(true);
    const res = await addStaff(email, role);
    setBusy(false);
    if (res.error) return toast(res.error, "error");
    const invited = email.trim();
    setEmail("");
    toast(`Invite sent to ${invited}.`, "success");
    refresh();
  }

  return (
    <section className="mb-6">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-sm font-semibold">
          Team members{" "}
          <span className="font-normal text-neutral-400">({staff.length})</span>
        </h2>
      </div>
      <p className="mb-2 text-xs text-neutral-500">
        Only these emails can sign in. Adding a teammate emails them a sign-in
        link — they click it to accept, no password needed.
      </p>

      <div className="rounded-xl border border-neutral-800 bg-neutral-900">
        {staff.length === 0 ? (
          <p className="px-4 py-3 text-sm text-neutral-400">No team members.</p>
        ) : (
          staff.map((m) => (
            <StaffRow key={m.email} member={m} onChanged={refresh} />
          ))
        )}

        <div className="flex flex-wrap items-center gap-2 border-t border-neutral-800 px-4 py-3">
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            placeholder="teammate@digitalnicheagency.com"
            className="min-w-56 flex-1 rounded-lg border border-neutral-700 px-3 py-2 text-sm text-neutral-100"
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as StaffRole)}
            className="rounded-lg border border-neutral-700 px-2 py-1.5 text-sm text-neutral-100"
          >
            {ROLE_OPTIONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
          <button
            onClick={add}
            disabled={busy}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            Add
          </button>
        </div>
      </div>
    </section>
  );
}

function StaffRow({
  member,
  onChanged,
}: {
  member: StaffMember;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const isMaster = member.email === MASTER_EMAIL;
  const uiRole: StaffRole = member.role === "owner" ? "owner" : "member";

  async function changeRole(next: StaffRole) {
    setBusy(true);
    const res = await setStaffRole(member.email, next);
    setBusy(false);
    if (res.error) return toast(res.error, "error");
    onChanged();
  }
  async function remove() {
    setBusy(true);
    const res = await removeStaff(member.email);
    setBusy(false);
    if (res.error) return toast(res.error, "error");
    onChanged();
  }
  async function resend() {
    setBusy(true);
    const res = await resendInvite(member.email);
    setBusy(false);
    if (res.error) return toast(res.error, "error");
    toast(`Invite re-sent to ${member.email}.`, "success");
  }

  return (
    <div className="flex items-center gap-2 border-t border-neutral-800 px-4 py-2.5 text-sm first:border-t-0">
      <span className="flex-1 truncate">
        {member.email}
        {isMaster && (
          <span className="ml-1.5 rounded-full bg-indigo-500/15 px-2 py-0.5 text-[11px] font-medium text-indigo-300">
            master
          </span>
        )}
        <span
          className={`ml-1.5 rounded-full px-2 py-0.5 text-[11px] ${
            member.joined
              ? "bg-green-500/15 text-green-300"
              : "bg-amber-500/15 text-amber-300"
          }`}
        >
          {member.joined ? "active" : "invited"}
        </span>
      </span>

      {isMaster ? (
        <span className="text-xs text-neutral-500">{roleLabel(member.role)}</span>
      ) : (
        <>
          <select
            value={uiRole}
            onChange={(e) => changeRole(e.target.value as StaffRole)}
            disabled={busy}
            className="rounded-lg border border-neutral-700 px-2 py-1.5 text-sm text-neutral-100"
          >
            {ROLE_OPTIONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
          {!member.joined && (
            <button
              onClick={resend}
              disabled={busy}
              className="rounded-lg border border-neutral-700 px-2.5 py-1 text-xs hover:bg-neutral-800 disabled:opacity-50"
            >
              Resend
            </button>
          )}
          <button
            onClick={remove}
            disabled={busy}
            className="rounded-lg border border-red-500/30 px-2.5 py-1 text-xs text-red-400 hover:bg-red-500/15 disabled:opacity-50"
          >
            Remove
          </button>
        </>
      )}
    </div>
  );
}
