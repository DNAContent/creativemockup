"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { Creative, CreativeStatus, SetStatus } from "@/lib/types";

// Fields a staff editor (or an "editor"-tier client) may change on a creative.
// Excludes id / set_id / position / created_at, which are managed separately.
export type CreativeEdit = Partial<
  Pick<
    Creative,
    | "name"
    | "format"
    | "status"
    | "brand_name"
    | "brand_logo"
    | "copy"
    | "headline"
    | "description"
    | "cta"
    | "email_subject"
    | "email_preheader"
    | "email_body"
    | "media_img"
    | "media_video"
    | "aspect_ratio"
    | "creative_type"
    | "slides"
  >
>;

function revalidateEditor(setId: string) {
  revalidatePath(`/editor/${setId}`);
}

// Rename the set from inside the editor.
export async function renameSet(setId: string, name: string) {
  const supabase = await createClient();
  const clean = name.trim();
  if (!clean) return { error: "Set name can't be empty." };
  const { error } = await supabase
    .from("creative_sets")
    .update({ name: clean })
    .eq("id", setId);
  if (error) return { error: error.message };
  revalidateEditor(setId);
  return {};
}

// Creatives can ONLY be created inside a set's editor — hence setId is required.
export async function createCreative(setId: string, format = "fb-feed") {
  const supabase = await createClient();

  // Next position = current max + 1 (RLS scopes this to the caller's sets).
  const { data: last } = await supabase
    .from("ads")
    .select("position")
    .eq("set_id", setId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const position = (last?.position ?? -1) + 1;

  // Prefill brand from the owning client so mockups carry the brand by default.
  const { data: setRow } = await supabase
    .from("creative_sets")
    .select("clients(brand_name, brand_logo, name)")
    .eq("id", setId)
    .maybeSingle();
  const cl = (setRow?.clients ?? null) as {
    brand_name: string | null;
    brand_logo: string | null;
    name: string | null;
  } | null;
  const brand_name = cl?.brand_name || cl?.name || "";
  const brand_logo = cl?.brand_logo || "";

  const { data, error } = await supabase
    .from("ads")
    .insert({ set_id: setId, position, format, brand_name, brand_logo })
    .select("id")
    .single();
  if (error) return { error: error.message };

  revalidateEditor(setId);
  return { id: data.id as string };
}

export async function updateCreative(
  setId: string,
  creativeId: string,
  patch: CreativeEdit,
) {
  const supabase = await createClient();
  const { error } = await supabase.from("ads").update(patch).eq("id", creativeId);
  if (error) return { error: error.message };
  revalidateEditor(setId);
  return {};
}

export async function setCreativeStatus(
  setId: string,
  creativeId: string,
  status: CreativeStatus,
) {
  return updateCreative(setId, creativeId, { status });
}

export async function deleteCreative(setId: string, creativeId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("ads").delete().eq("id", creativeId);
  if (error) return { error: error.message };
  revalidateEditor(setId);
  return {};
}

// Persist a new ordering. `orderedIds` is the full list of creative ids in the
// desired order; the DB writes position = index for all rows in ONE statement
// (db/15 `reorder_creatives`) so a partial failure or a concurrent reorder
// can't leave duplicate/scrambled positions.
export async function reorderCreatives(setId: string, orderedIds: string[]) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("reorder_creatives", {
    p_set_id: setId,
    p_ordered_ids: orderedIds,
  });
  if (error) return { error: error.message };
  revalidateEditor(setId);
  return {};
}

export async function setSetStatus(setId: string, status: SetStatus) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("creative_sets")
    .update({ status })
    .eq("id", setId);
  if (error) return { error: error.message };
  revalidateEditor(setId);
  return {};
}

// Resolve / reopen a comment (staff, or approver+ client per RLS).
export async function setCommentResolved(
  setId: string,
  commentId: string,
  resolved: boolean,
) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("comments")
    .update({ resolved })
    .eq("id", commentId);
  if (error) return { error: error.message };
  revalidateEditor(setId);
  return {};
}

// Staff reply to a client comment. The author is the staff member's email so
// the reply trigger (db/14) can email the original commenter a link to the set.
export async function addReply(
  setId: string,
  commentId: string,
  text: string,
) {
  const body = text.trim();
  if (!body) return { error: "Reply can't be empty." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("replies")
    .insert({ comment_id: commentId, author: user?.email ?? "Agency", text: body });
  if (error) return { error: error.message };
  revalidateEditor(setId);
  return {};
}
