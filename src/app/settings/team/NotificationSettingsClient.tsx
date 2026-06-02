"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import {
  saveSlackSettings,
  setEmailPref,
  type EmailPrefField,
  type SlackSettings,
} from "./notify-actions";

export type MemberPref = {
  user_id: string;
  email: string;
  email_on_comment: boolean;
  email_on_access_request: boolean;
  email_on_approval: boolean;
};

const EMAIL_EVENTS: { field: EmailPrefField; label: string }[] = [
  { field: "email_on_comment", label: "Comments" },
  { field: "email_on_access_request", label: "Access requests" },
  { field: "email_on_approval", label: "Approvals" },
];

export default function NotificationSettingsClient({
  agencyId,
  slack,
  members,
}: {
  agencyId: string;
  slack: SlackSettings;
  members: MemberPref[];
}) {
  return (
    <section className="mb-6">
      <h2 className="mb-2 text-sm font-semibold">Notifications</h2>
      <SlackBlock agencyId={agencyId} initial={slack} />
      <EmailBlock agencyId={agencyId} members={members} />
    </section>
  );
}

function SlackBlock({
  agencyId,
  initial,
}: {
  agencyId: string;
  initial: SlackSettings;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [s, setS] = useState<SlackSettings>(initial);
  const [saving, setSaving] = useState(false);

  function set<K extends keyof SlackSettings>(k: K, v: SlackSettings[K]) {
    setS((prev) => ({ ...prev, [k]: v }));
  }

  async function save() {
    setSaving(true);
    const res = await saveSlackSettings(agencyId, s);
    setSaving(false);
    if (res.error) return toast(res.error, "error");
    toast("Slack settings saved", "success");
    router.refresh();
  }

  return (
    <div className="mb-3 rounded-xl border border-neutral-800 bg-neutral-900 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Slack (team channel)</h3>
        <label className="flex items-center gap-2 text-xs text-neutral-500">
          <input
            type="checkbox"
            checked={s.slack_enabled}
            onChange={(e) => set("slack_enabled", e.target.checked)}
          />
          Enabled
        </label>
      </div>
      <p className="mt-1 text-xs text-neutral-400">
        Posts to one channel via an{" "}
        <a
          href="https://api.slack.com/messaging/webhooks"
          target="_blank"
          rel="noreferrer"
          className="text-indigo-300 hover:underline"
        >
          incoming webhook
        </a>
        . Everyone in that channel sees these.
      </p>

      <input
        value={s.slack_webhook_url ?? ""}
        onChange={(e) => set("slack_webhook_url", e.target.value)}
        placeholder="https://hooks.slack.com/services/…"
        className="mt-2 w-full rounded-lg border border-neutral-700 px-3 py-2 text-sm"
      />

      <div className="mt-3 flex flex-wrap gap-4">
        <Check
          label="Comments"
          checked={s.slack_on_comment}
          onChange={(v) => set("slack_on_comment", v)}
        />
        <Check
          label="Access requests"
          checked={s.slack_on_access_request}
          onChange={(v) => set("slack_on_access_request", v)}
        />
        <Check
          label="Approvals"
          checked={s.slack_on_approval}
          onChange={(v) => set("slack_on_approval", v)}
        />
      </div>

      <div className="mt-3 flex justify-end">
        <button
          onClick={save}
          disabled={saving}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save Slack settings"}
        </button>
      </div>
    </div>
  );
}

function EmailBlock({
  agencyId,
  members,
}: {
  agencyId: string;
  members: MemberPref[];
}) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
      <h3 className="text-sm font-semibold">Email (per teammate)</h3>
      <p className="mt-1 text-xs text-neutral-400">
        Choose who on your team gets emailed for each event. (Email delivery is
        configured separately.)
      </p>

      {members.length === 0 ? (
        <p className="mt-2 text-sm text-neutral-400">No teammates yet.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-neutral-400">
                <th className="pb-2 font-normal">Teammate</th>
                {EMAIL_EVENTS.map((ev) => (
                  <th key={ev.field} className="pb-2 pl-3 font-normal">
                    {ev.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <MemberRow key={m.user_id} agencyId={agencyId} member={m} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function MemberRow({
  agencyId,
  member,
}: {
  agencyId: string;
  member: MemberPref;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function toggle(field: EmailPrefField, value: boolean) {
    setBusy(true);
    const res = await setEmailPref(agencyId, member.user_id, field, value);
    setBusy(false);
    if (res.error) return toast(res.error, "error");
    router.refresh();
  }

  return (
    <tr className="border-t border-neutral-800">
      <td className="py-2 pr-3">{member.email}</td>
      {EMAIL_EVENTS.map((ev) => (
        <td key={ev.field} className="py-2 pl-3">
          <input
            type="checkbox"
            disabled={busy}
            checked={member[ev.field]}
            onChange={(e) => toggle(ev.field, e.target.checked)}
          />
        </td>
      ))}
    </tr>
  );
}

function Check({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-neutral-300">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}
