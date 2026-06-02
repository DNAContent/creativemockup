import type { Message } from "./events";

// Email delivery — provider intentionally NOT wired yet (TBD: Resend / SMTP).
//
// This is the single drop-in point. To turn email on:
//   1. Add the provider SDK + an API key env var.
//   2. Implement the send below (build an HTML/text body from `msg`).
// Everything upstream — recipient resolution from notification_prefs and
// client_contacts — already works, so no other code needs to change.
//
// Until then this logs what *would* be sent so you can verify the wiring.
export async function sendEmail(opts: { to: string[]; msg: Message }) {
  const { to, msg } = opts;
  if (!to.length) return;

  // TODO(email-provider): replace this stub with a real send.
  console.log(
    `[notify:email:stub] would email ${to.length} recipient(s): "${msg.title}" -> ${to.join(", ")}`,
  );
}
