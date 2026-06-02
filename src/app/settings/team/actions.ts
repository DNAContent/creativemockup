"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { ContactCaps } from "@/lib/types";

const PATH = "/settings/team";

// All team actions resolve to this shape so callers can read `.error` uniformly.
type ActionResult = { error?: string };

export async function addContact(
  clientId: string,
  email: string,
  caps: ContactCaps,
  name?: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase.from("client_contacts").insert({
    client_id: clientId,
    email: email.trim().toLowerCase(),
    name: name?.trim() || null,
    can_comment: caps.can_comment,
    can_approve: caps.can_approve,
    can_edit: caps.can_edit,
    invited_by: user?.id ?? null,
  });
  if (error) return { error: error.message };
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
    .select("email, creative_sets(client_id)")
    .eq("id", requestId)
    .maybeSingle();
  if (reqErr) return { error: reqErr.message };
  if (!req) return { error: "Request not found." };

  const rel = req.creative_sets as
    | { client_id: string }
    | { client_id: string }[]
    | null;
  const clientId = Array.isArray(rel) ? rel[0]?.client_id : rel?.client_id;
  if (!clientId) return { error: "Could not resolve client for request." };

  const add = await addContact(clientId, req.email as string, caps);
  if (add.error) return add;

  const { error } = await supabase
    .from("access_requests")
    .update({ status: "granted" })
    .eq("id", requestId);
  if (error) return { error: error.message };
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
