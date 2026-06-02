import type { Message } from "./events";

// Email delivery via the SendGrid Web API (https://api.sendgrid.com/v3/mail/send).
// Uses the same verified domain as the Supabase auth SMTP setup. Requires:
//   SENDGRID_API_KEY   — a key with "Mail Send" permission
//   NOTIFY_FROM_EMAIL  — a from-address on your verified domain (optional;
//                        defaults to helix@digitalnicheagency.com)
// If the key is absent (e.g. local dev) we log instead of sending, so the rest
// of the notify pipeline can still be exercised.
//
// Each recipient gets their OWN message (one personalization per address) so
// clients never see each other's emails in the To: header.
export async function sendEmail(opts: { to: string[]; msg: Message }) {
  const recipients = [...new Set(opts.to.filter((e) => e && e.includes("@")))];
  if (!recipients.length) return;
  const { msg } = opts;

  const key = process.env.SENDGRID_API_KEY;
  const from = process.env.NOTIFY_FROM_EMAIL ?? "helix@digitalnicheagency.com";

  if (!key) {
    console.log(
      `[notify:email:stub] SENDGRID_API_KEY unset — would email ${recipients.length}: "${msg.title}" -> ${recipients.join(", ")}`,
    );
    return;
  }

  try {
    const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        personalizations: recipients.map((email) => ({ to: [{ email }] })),
        from: { email: from, name: "Helix" },
        subject: msg.title,
        content: [
          { type: "text/plain", value: textBody(msg) },
          { type: "text/html", value: htmlBody(msg) },
        ],
      }),
    });
    if (!res.ok) {
      console.error(
        `[notify:email] SendGrid ${res.status}: ${await res.text().catch(() => "")}`,
      );
    }
  } catch (err) {
    console.error("[notify:email] send failed", err);
  }
}

function textBody(msg: Message): string {
  return [msg.title, "", msg.body, msg.url ? `\nOpen: ${msg.url}` : ""]
    .join("\n")
    .trim();
}

function htmlBody(msg: Message): string {
  const button = msg.url
    ? `<tr><td style="padding-top:20px">
         <a href="${escapeHtml(msg.url)}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:11px 20px;border-radius:8px;font-weight:600;font-size:14px">Open in Helix</a>
       </td></tr>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif;color:#171717">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:24px 12px">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fff;border-radius:12px;padding:28px">
          <tr><td style="font-size:13px;font-weight:700;color:#4f46e5;letter-spacing:.04em;padding-bottom:14px">HELIX</td></tr>
          <tr><td style="font-size:18px;font-weight:700;line-height:1.35">${escapeHtml(msg.title)}</td></tr>
          <tr><td style="font-size:14px;line-height:1.6;color:#404040;padding-top:8px">${escapeHtml(msg.body)}</td></tr>
          ${button}
          <tr><td style="font-size:12px;color:#a3a3a3;padding-top:24px">Digital Niche Agency · Helix creative review</td></tr>
        </table>
      </td></tr>
    </table>
  </body></html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
