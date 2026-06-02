import type { Message } from "./events";

// Post a message to a Slack incoming webhook. The webhook URL already targets a
// specific channel, so "who sees it" is whoever is in that channel.
export async function sendSlack(webhookUrl: string, msg: Message) {
  const text = [`*${msg.title}*`, msg.body, msg.url]
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
