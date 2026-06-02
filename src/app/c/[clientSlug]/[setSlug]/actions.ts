"use server";

import { createClient } from "@/lib/supabase/server";
import { headers } from "next/headers";

// Step 1 of the client gate. Checks the allowlist via request_access():
//   * allowlisted  -> send a magic link, return { sent: true }
//   * not on list  -> request_access logged a row + (server) notifies team;
//                     return { requested: true }
export async function requestAccessOrSignIn(
  clientSlug: string,
  setSlug: string,
  formData: FormData,
) {
  const email = String(formData.get("email") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();
  if (!email) return { error: "Email is required." };

  const supabase = await createClient();

  const { data: role, error } = await supabase.rpc("request_access", {
    p_client_slug: clientSlug,
    p_set_slug: setSlug,
    p_email: email,
    p_message: message || null,
  });
  if (error) return { error: error.message };

  // Not allowlisted: request_access already recorded the ask for the team.
  if (!role) return { requested: true };

  const h = await headers();
  const origin =
    process.env.NEXT_PUBLIC_SITE_URL ??
    `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const next = `/c/${clientSlug}/${setSlug}`;

  const { error: otpError } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });
  if (otpError) return { error: otpError.message };

  return { sent: true };
}
