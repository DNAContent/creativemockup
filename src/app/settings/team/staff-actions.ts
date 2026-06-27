"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

// Internal-staff management. Owner-only — enforced in the DB by the SECURITY
// DEFINER RPCs (staff_add / staff_set_role / staff_remove); these wrappers just
// surface errors to the UI. See db/08_roles_and_staff.sql.

const PATH = "/settings/team";

export type StaffRole = "owner" | "member";
// `warning` = the action SUCCEEDED but with a caveat (e.g. invite email failed);
// callers should still refresh, unlike a hard `error`.
type ActionResult = { error?: string; warning?: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Email the invitee a magic sign-in link that lands on the dashboard, where
// they're auto-enrolled (their email is now on the allowlist).
async function sendInviteLink(
  supabase: Awaited<ReturnType<typeof createClient>>,
  email: string,
): Promise<string | null> {
  const h = await headers();
  const origin =
    process.env.NEXT_PUBLIC_SITE_URL ??
    `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: `${origin}/auth/callback?next=/`,
    },
  });
  return error ? error.message : null;
}

export async function addStaff(
  email: string,
  role: StaffRole,
): Promise<ActionResult> {
  const supabase = await createClient();
  const clean = email.trim().toLowerCase();
  if (!EMAIL_RE.test(clean)) return { error: "Enter a valid email address." };
  // staff_add is owner-gated in the DB, so this also guards the invite email.
  const { error } = await supabase.rpc("staff_add", {
    p_email: clean,
    p_role: role,
  });
  if (error) return { error: error.message };

  const mailErr = await sendInviteLink(supabase, clean);
  revalidatePath(PATH);
  // The teammate WAS added; a failed invite email is a warning, not a failure,
  // so the UI still refreshes (and won't prompt a duplicate add).
  if (mailErr) return { warning: `Added, but the invite email failed: ${mailErr}` };
  return {};
}

// Re-send the sign-in link to an already-added teammate. Owner-gated here since
// it doesn't go through a staff_* RPC.
export async function resendInvite(email: string): Promise<ActionResult> {
  const supabase = await createClient();
  // Read OUR OWN membership row — without the user_id filter, RLS returns every
  // teammate's row and .limit(1) picks an arbitrary one, so a member could read
  // an owner's role (and vice-versa).
  const { data: claimsData } = await supabase.auth.getClaims();
  const uid = claimsData?.claims?.sub;
  const { data: me } = await supabase
    .from("agency_members")
    .select("role")
    .eq("user_id", uid ?? "")
    .maybeSingle();
  if (me?.role !== "owner") {
    return { error: "Only an owner can send invites." };
  }
  const mailErr = await sendInviteLink(supabase, email.trim().toLowerCase());
  if (mailErr) return { error: mailErr };
  return {};
}

export async function setStaffRole(
  email: string,
  role: StaffRole,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("staff_set_role", {
    p_email: email,
    p_role: role,
  });
  if (error) return { error: error.message };
  revalidatePath(PATH);
  return {};
}

export async function removeStaff(email: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("staff_remove", { p_email: email });
  if (error) return { error: error.message };
  revalidatePath(PATH);
  return {};
}
