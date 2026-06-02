import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendSlack } from "@/lib/notify/slack";
import { sendEmail } from "@/lib/notify/email";
import {
  eventSummary,
  slackFlag,
  staffEmailFlag,
  type NotifyEvent,
} from "@/lib/notify/events";

// Receives events POSTed by the DB triggers (db/06_notifications.sql) and fans
// out to Slack + email. Authenticated by a shared secret header that must match
// both NOTIFY_HOOK_SECRET (here) and notify_config.secret (in the DB).
export async function POST(req: NextRequest) {
  const secret = process.env.NOTIFY_HOOK_SECRET;
  if (!secret || req.headers.get("x-notify-secret") !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let event: NotifyEvent;
  try {
    event = (await req.json()) as NotifyEvent;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (!event?.type || !event.agency_id) {
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  }

  const admin = createAdminClient();
  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? new URL(req.url).origin;
  const msg = eventSummary(event, baseUrl);

  // --- Slack (internal, channel-wide) -------------------------------------
  const sFlag = slackFlag(event);
  if (sFlag) {
    const { data: settings } = await admin
      .from("notification_settings")
      .select(
        "slack_enabled, slack_webhook_url, slack_on_comment, slack_on_access_request, slack_on_approval",
      )
      .eq("agency_id", event.agency_id)
      .maybeSingle();
    if (
      settings?.slack_enabled &&
      settings.slack_webhook_url &&
      (settings as Record<string, boolean>)[sFlag]
    ) {
      await sendSlack(settings.slack_webhook_url, msg);
    }
  }

  // --- Email ---------------------------------------------------------------
  if (event.type === "needs_review") {
    // Client-facing: email the client's allowlisted contacts.
    const { data: contacts } = await admin
      .from("client_contacts")
      .select("email")
      .eq("client_id", event.client_id);
    await sendEmail({ to: (contacts ?? []).map((c) => c.email), msg });
  } else if (event.type === "reply") {
    // Client-facing: email just the person whose comment was replied to.
    await sendEmail({ to: [event.recipient_email], msg });
  } else {
    // Internal: email the staff who opted in for this event type.
    const eFlag = staffEmailFlag(event);
    if (eFlag) {
      const { data: prefs } = await admin
        .from("notification_prefs")
        .select("user_id")
        .eq("agency_id", event.agency_id)
        .eq(eFlag, true);
      const emails: string[] = [];
      for (const p of prefs ?? []) {
        const { data } = await admin.auth.admin.getUserById(p.user_id);
        if (data.user?.email) emails.push(data.user.email);
      }
      await sendEmail({ to: emails, msg });
    }
  }

  return NextResponse.json({ ok: true });
}
