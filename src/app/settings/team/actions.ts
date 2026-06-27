"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import type { ContactCaps } from "@/lib/types";

const PATH = "/settings/team";

// All team actions resolve to this shape so callers can read `.error` uniformly.
// `warning` = succeeded with a caveat (caller should still refresh).
type ActionResult = { error?: string; warning?: string };

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
  revalidatePath("/"); // dashboard card may show this client's primary contact
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
  revalidatePath("/");
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
  // One transactional, staff-gated RPC (db/21) clears the client's other
  // primaries and sets this one — avoids the clear-then-set race that could
  // collide on the one-primary-per-client partial unique index.
  const { error } = await supabase.rpc("set_contact_primary", {
    p_contact_id: contactId,
    p_make: makePrimary,
  });
  if (error) return { error: error.message };
  revalidatePath(PATH);
  revalidatePath("/");
  return {};
}

export async function removeContact(contactId: string): Promise<ActionResult> {
  const supabase = await createClient();
  // Note whether this was the client's primary so we can promote a replacement.
  const { data: removed } = await supabase
    .from("client_contacts")
    .select("client_id, is_primary")
    .eq("id", contactId)
    .maybeSingle();

  const { error } = await supabase
    .from("client_contacts")
    .delete()
    .eq("id", contactId);
  if (error) return { error: error.message };

  // If the primary was removed, promote the oldest remaining contact so the
  // client always has a deterministic primary (and the dashboard/header keep
  // showing a real, sign-in-capable contact).
  if (removed?.is_primary && removed.client_id) {
    const { data: next } = await supabase
      .from("client_contacts")
      .select("id")
      .eq("client_id", removed.client_id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (next?.id) {
      await supabase.rpc("set_contact_primary", { p_contact_id: next.id, p_make: true });
    }
  }

  revalidatePath(PATH);
  revalidatePath("/");
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
  // Build the deep-link base from NEXT_PUBLIC_SITE_URL, falling back to the
  // request host (same as the client gate) so the magic link still lands on the
  // right review even when the env var isn't set.
  const h = await headers();
  const origin =
    process.env.NEXT_PUBLIC_SITE_URL ??
    `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const emailRedirectTo =
    clientSlug && set?.slug
      ? `${origin}/auth/callback?next=/c/${clientSlug}/${set.slug}`
      : undefined;
  const { error: otpErr } = await supabase.auth.signInWithOtp({
    email: emailNorm,
    options: { shouldCreateUser: true, emailRedirectTo },
  });
  // Access was already granted; a failed email is a warning, not a failure — so
  // refresh the inbox (the request is no longer pending) instead of leaving it.
  revalidatePath(PATH);
  if (otpErr) {
    console.error("[grantRequest] magic-link send failed", otpErr.message);
    return { warning: `Access granted, but the sign-in email failed to send (${otpErr.message}). Ask them to open the review link and enter their email.` };
  }
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
