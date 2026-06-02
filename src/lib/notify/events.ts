// Notification event shapes + message formatting. Events are produced by the
// DB triggers in db/06_notifications.sql and consumed by /api/hooks/notify.

export type NotifyEvent =
  | {
      type: "comment";
      agency_id: string;
      client_name: string;
      client_slug: string;
      set_name: string;
      set_slug: string;
      creative_name: string;
      author: string;
      target: string;
      text: string;
    }
  | {
      type: "access_request";
      agency_id: string;
      client_name: string;
      set_name: string;
      email: string;
      message: string | null;
    }
  | {
      type: "approval";
      agency_id: string;
      client_name: string;
      set_name: string;
      creative_name: string;
      approver: string | null;
    }
  | {
      type: "needs_review";
      agency_id: string;
      client_id: string;
      client_name: string;
      client_slug: string;
      set_name: string;
      set_slug: string;
    };

// Which per-agency Slack toggle column gates this event (null = not a Slack event).
export function slackFlag(
  e: NotifyEvent,
): "slack_on_comment" | "slack_on_access_request" | "slack_on_approval" | null {
  switch (e.type) {
    case "comment":
      return "slack_on_comment";
    case "access_request":
      return "slack_on_access_request";
    case "approval":
      return "slack_on_approval";
    default:
      return null;
  }
}

// Which per-staff email opt-in column gates this event (null = not a staff email).
export function staffEmailFlag(
  e: NotifyEvent,
): "email_on_comment" | "email_on_access_request" | "email_on_approval" | null {
  switch (e.type) {
    case "comment":
      return "email_on_comment";
    case "access_request":
      return "email_on_access_request";
    case "approval":
      return "email_on_approval";
    default:
      return null;
  }
}

export type Message = { title: string; body: string; url?: string };

// Human-readable summary for an event. `baseUrl` is the app origin used to
// build deep links.
export function eventSummary(e: NotifyEvent, baseUrl: string): Message {
  switch (e.type) {
    case "comment":
      return {
        title: `New feedback on ${e.client_name} — ${e.set_name}`,
        body: `${e.author} commented on “${e.creative_name}” (${e.target}): ${e.text}`,
        url: `${baseUrl}/c/${e.client_slug}/${e.set_slug}`,
      };
    case "access_request":
      return {
        title: `Access request: ${e.client_name} — ${e.set_name}`,
        body: e.message
          ? `${e.email} asked for access: “${e.message}”`
          : `${e.email} asked for access.`,
        url: `${baseUrl}/settings/team`,
      };
    case "approval":
      return {
        title: `Approved: ${e.client_name} — ${e.set_name}`,
        body: `${e.approver ?? "A client"} approved “${e.creative_name}”.`,
      };
    case "needs_review":
      return {
        title: `${e.set_name} is ready for your review`,
        body: `${e.client_name}, a new set of creatives is ready for your review and approval.`,
        url: `${baseUrl}/c/${e.client_slug}/${e.set_slug}`,
      };
  }
}
