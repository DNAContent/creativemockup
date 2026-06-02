"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";

// Client landing (/c) sign-in: email a magic link back to /c. Clients are
// passwordless — access to actual sets is still gated by client_contacts.
export async function clientSignIn(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  // Where to land after sign-in; only allow /c paths (no open redirect).
  const rawNext = String(formData.get("next") ?? "/c");
  const next = rawNext.startsWith("/c") ? rawNext : "/c";
  if (!email) redirect(`${next}?error=${encodeURIComponent("Enter your email.")}`);

  const supabase = await createClient();
  const h = await headers();
  const origin =
    process.env.NEXT_PUBLIC_SITE_URL ??
    `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });
  if (error) redirect(`${next}?error=${encodeURIComponent(error.message)}`);
  redirect(`${next}?sent=1`);
}

export async function clientSignOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/c");
}
