import type { Message } from "./events";

// Slack mrkdwn treats &, <, > specially: <!channel>/<!here> ping everyone and
// <url|label> injects clickable links. User-derived text (incl. unauthenticated
// access-request email/message) must be escaped so it can't ping or phish the
// staff channel. https://api.slack.com/reference/surfaces/formatting#escaping
function slackEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Post a message to a Slack incoming webhook. The webhook URL already targets a
// specific channel, so "who sees it" is whoever is in that channel.
export async function sendSlack(webhookUrl: string, msg: Message) {
  const text = [`*${slackEscape(msg.title)}*`, msg.body && slackEscape(msg.body), msg.url]
    .filter(Boolean)
    .join("\n");
  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
  } catch (err) {
    console.error("[notify:slack] failed", err);
  }
}
