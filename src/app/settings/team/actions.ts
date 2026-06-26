"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { ContactCaps } from "@/lib/types";

const PATH = "/settings/team";

// All team actions resolve to this shape so callers can read `.error` uniformly.
type ActionResult = { error?: string };

// Pragmatic email check — enough to reject empty/garbage before it becomes a
// junk allowlist row that can never receive a magic link.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function addContact(
  clientId: string,
  email: string,
  caps: ContactCaps,
  name?: string,
): Promise<ActionResult> {
  const clean = email.trim().toLowerCase();
  if (!EMAIL_RE.test(clean)) return { error: "Enter a valid email address." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase.from("client_contacts").insert({
    client_id: clientId,
    email: clean,
    name: name?.trim() || null,
    can_comment: caps.can_comment,
    can_approve: caps.can_approve,
    can_edit: caps.can_edit,
    invited_by: user?.id ?? null,
  });
  if (error) {
    // 23505 = unique-violation: this email is already a contact on this client.
    if (error.code === "23505")
      return { error: "That email is already a contact for this client." };
    return { error: error.message };
  }
  revalidatePath(PATH);
  return {};
}

export async function setContactCaps(
  contactId: string,
  caps: ContactCaps,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("client_contacts")
    .update({
      can_comment: caps.can_comment,
      can_approve: caps.can_approve,
      can_edit: caps.can_edit,
    })
    .eq("id", contactId);
  if (error) return { error: error.message };
  revalidatePath(PATH);
  return {};
}

// Mark a contact as this client's primary (the one shown on the dashboard +
// client header), or clear it. A partial unique index enforces one primary per
// client, so we clear the client's other primaries first, then set this one.
export async function setContactPrimary(
  contactId: string,
  makePrimary: boolean,
): Promise<ActionResult> {
  const supabase = await createClient();

  // Resolve the owning client so we can clear its other primaries.
  const { data: contact, error: lookupErr } = await supabase
    .from("client_contacts")
    .select("client_id")
    .eq("id", contactId)
    .maybeSingle();
  if (lookupErr) return { error: lookupErr.message };
  if (!contact) return { error: "Contact not found." };

  if (makePrimary) {
    const { error: clearErr } = await supabase
      .from("client_contacts")
      .update({ is_primary: false })
      .eq("client_id", contact.client_id)
      .neq("id", contactId);
    if (clearErr) return { error: clearErr.message };
  }

  const { error } = await supabase
    .from("client_contacts")
    .update({ is_primary: makePrimary })
    .eq("id", contactId);
  if (error) return { error: error.message };
  revalidatePath(PATH);
  revalidatePath("/");
  return {};
}

export async function removeContact(contactId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("client_contacts")
    .delete()
    .eq("id", contactId);
  if (error) return { error: error.message };
  revalidatePath(PATH);
  return {};
}

// Approve an access request: add the requester to the allowlist at `role`, then
// mark the request granted.
export async function grantRequest(
  requestId: string,
  caps: ContactCaps,
): Promise<ActionResult> {
  const supabase = await createClient();

  const { data: req, error: reqErr } = await supabase
    .from("access_requests")
    .select("email, status, creative_sets(client_id, slug, clients(slug))")
    .eq("id", requestId)
    .maybeSingle();
  if (reqErr) return { error: reqErr.message };
  if (!req) return { error: "Request not found." };

  // Idempotent: a second click (or a stale UI) shouldn't re-add the contact.
  if (req.status === "granted") {
    revalidatePath(PATH);
    return {};
  }

  type SetRel = {
    client_id: string;
    slug: string | null;
    clients: { slug: string | null } | { slug: string | null }[] | null;
  };
  const rel = req.creative_sets as SetRel | SetRel[] | null;
  const set = Array.isArray(rel) ? rel[0] : rel;
  const clientId = set?.client_id;
  if (!clientId) return { error: "Could not resolve client for request." };

  // Upsert the contact: if they're already on this client (e.g. requested
  // access twice), just apply the granted caps instead of hitting the unique
  // index and surfacing a raw Postgres error.
  const emailNorm = (req.email as string).trim().toLowerCase();
  const { data: existing } = await supabase
    .from("client_contacts")
    .select("id")
    .eq("client_id", clientId)
    .eq("email", emailNorm)
    .maybeSingle();
  const res = existing
    ? await setContactCaps(existing.id as string, caps)
    : await addContact(clientId, emailNorm, caps);
  if (res.error) return res;

  const { error } = await supabase
    .from("access_requests")
    .update({ status: "granted" })
    .eq("id", requestId);
  if (error) return { error: error.message };

  // Send the sign-in link the Gate promised ("you'll get a link by email").
  // Magic links go through Supabase Auth email (not the SendGrid notify stub),
  // so this works wherever client magic-link sign-in works. Best-effort: the
  // grant itself already succeeded, so a send failure only warns.
  const clientSlug = Array.isArray(set?.clients)
    ? set?.clients[0]?.slug
    : set?.clients?.slug;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  const emailRedirectTo =
    siteUrl && clientSlug && set?.slug
      ? `${siteUrl}/auth/callback?next=/c/${clientSlug}/${set.slug}`
      : undefined;
  const { error: otpErr } = await supabase.auth.signInWithOtp({
    email: emailNorm,
    options: { shouldCreateUser: true, emailRedirectTo },
  });
  if (otpErr) {
    console.error("[grantRequest] magic-link send failed", otpErr.message);
    return { error: `Access granted, but the sign-in email failed to send (${otpErr.message}). Ask them to open the review link and enter their email.` };
  }

  revalidatePath(PATH);
  return {};
}

export async function denyRequest(requestId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("access_requests")
    .update({ status: "denied" })
    .eq("id", requestId);
  if (error) return { error: error.message };
  revalidatePath(PATH);
  return {};
}
