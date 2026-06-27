import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import AppHeader, { HeaderLink } from "@/components/AppHeader";
import TeamClient, { type PendingRequest } from "./TeamClient";
import NotificationSettingsClient, {
  type MemberPref,
} from "./NotificationSettingsClient";
import StaffClient, { type StaffMember } from "./StaffClient";
import type { SlackSettings } from "./notify-actions";

const SLACK_DEFAULTS: SlackSettings = {
  slack_webhook_url: null,
  slack_enabled: false,
  slack_on_comment: true,
  slack_on_access_request: true,
  slack_on_approval: true,
};

// Team / access management: who (which client emails) can reach each client's
// reviews, at what permission tier; an inbox of access requests; and who on the
// team gets notified about client activity.
export default async function TeamSettings() {
  const supabase = await createClient();
  // The proxy already validated the session on this request; just confirm one
  // is present (getClaims reads it locally when possible — see src/app/page.tsx).
  const { data: claimsData } = await supabase.auth.getClaims();
  if (!claimsData?.claims) redirect("/login");
  const userId = claimsData.claims.sub as string;

  // Membership and the pending-requests inbox are independent reads, so fetch
  // them together — one parallel batch instead of two serial cross-region hops.
  // Filter membership to OUR row: RLS exposes every teammate, so an unfiltered
  // .limit(1) would read an arbitrary member's role and mis-gate the owner UI.
  const [{ data: membership }, { data: requests }] = await Promise.all([
    supabase
      .from("agency_members")
      .select("agency_id, role")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("access_requests")
      .select(
        "id,email,message,created_at, creative_sets!inner(name, clients!inner(name))",
      )
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .returns<PendingRequest[]>(),
  ]);
  const agencyId = membership?.agency_id ?? null;
  const isOwner = membership?.role === "owner";

  // Owner-only: the internal-staff allowlist (add/update/remove team members).
  let staff: StaffMember[] = [];
  if (isOwner) {
    const { data } = await supabase.rpc("staff_list");
    staff = (data as StaffMember[]) ?? [];
  }

  // Notification settings: ensure every member has a prefs row, then load the
  // Slack config + per-member email opt-ins.
  let slack: SlackSettings = SLACK_DEFAULTS;
  let members: MemberPref[] = [];
  if (agencyId) {
    await supabase.rpc("ensure_notification_prefs", { p_agency_id: agencyId });

    const [{ data: settings }, { data: emails }, { data: prefs }] =
      await Promise.all([
        supabase
          .from("notification_settings")
          .select(
            "slack_webhook_url,slack_enabled,slack_on_comment,slack_on_access_request,slack_on_approval",
          )
          .eq("agency_id", agencyId)
          .maybeSingle(),
        supabase.rpc("agency_member_emails", { p_agency_id: agencyId }),
        supabase
          .from("notification_prefs")
          .select(
            "user_id,email_on_comment,email_on_access_request,email_on_approval",
          )
          .eq("agency_id", agencyId),
      ]);

    if (settings) slack = { ...SLACK_DEFAULTS, ...settings };

    const prefByUser = new Map(
      (prefs ?? []).map((p) => [p.user_id as string, p]),
    );
    members = ((emails as { user_id: string; email: string }[]) ?? []).map(
      (m) => {
        const p = prefByUser.get(m.user_id);
        return {
          user_id: m.user_id,
          email: m.email,
          email_on_comment: p?.email_on_comment ?? true,
          email_on_access_request: p?.email_on_access_request ?? true,
          email_on_approval: p?.email_on_approval ?? false,
        };
      },
    );
  }

  return (
    <div className="flex-1">
      <AppHeader
        title="Team & access"
        right={<HeaderLink href="/">← Dashboard</HeaderLink>}
      />

      <div className="mx-auto w-full max-w-3xl px-6 pt-6">
        {isOwner && <StaffClient staff={staff} />}
        {agencyId && (
          <NotificationSettingsClient
            agencyId={agencyId}
            slack={slack}
            members={members}
          />
        )}
      </div>

      <TeamClient requests={requests ?? []} />
    </div>
  );
}
