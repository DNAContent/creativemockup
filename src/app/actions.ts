"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

type ActionResult = { error?: string };

function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

async function myAgencyId(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data } = await supabase
    .from("agency_members")
    .select("agency_id")
    .limit(1)
    .maybeSingle();
  return data?.agency_id as string | undefined;
}

// Insert `row` with a slug derived from `base`, retrying with -2, -3, … on a
// unique-violation (23505) so slugs stay unique within their parent.
async function insertWithSlug(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: "clients" | "creative_sets",
  row: Record<string, unknown>,
  base: string,
): Promise<ActionResult> {
  const root = slugify(base) || table.slice(0, 3);
  for (let n = 1; n <= 50; n++) {
    const slug = n === 1 ? root : `${root}-${n}`;
    const { error } = await supabase.from(table).insert({ ...row, slug });
    if (!error) return {};
    if (error.code !== "23505") return { error: error.message }; // not a slug collision
  }
  return { error: "Could not generate a unique slug." };
}

// ----- Clients ------------------------------------------------------------

export async function addClient(
  name: string,
  contactEmail?: string,
  logoUrl?: string,
  brandName?: string,
  brandLogo?: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const agencyId = await myAgencyId(supabase);
  if (!agencyId) return { error: "No agency found for this account." };
  const clean = name.trim();
  if (!clean) return { error: "Client name is required." };
  const res = await insertWithSlug(
    supabase,
    "clients",
    {
      agency_id: agencyId,
      name: clean,
      contact_email: contactEmail?.trim() || null,
      logo_url: logoUrl?.trim() || null,
      brand_name: brandName?.trim() || null,
      brand_logo: brandLogo?.trim() || null,
    },
    clean,
  );
  if (res.error) return res;
  revalidatePath("/");
  return {};
}

export async function updateClient(
  clientId: string,
  patch: {
    name?: string;
    contact_email?: string | null;
    logo_url?: string | null;
    brand_name?: string | null;
    brand_logo?: string | null;
  },
): Promise<ActionResult> {
  const supabase = await createClient();
  const fields: Record<string, unknown> = {};
  if (patch.name !== undefined) {
    const n = patch.name.trim();
    if (!n) return { error: "Client name can't be empty." };
    fields.name = n;
  }
  if (patch.contact_email !== undefined)
    fields.contact_email = patch.contact_email?.trim() || null;
  if (patch.logo_url !== undefined)
    fields.logo_url = patch.logo_url?.trim() || null;
  if (patch.brand_name !== undefined)
    fields.brand_name = patch.brand_name?.trim() || null;
  if (patch.brand_logo !== undefined)
    fields.brand_logo = patch.brand_logo?.trim() || null;

  const { error } = await supabase.from("clients").update(fields).eq("id", clientId);
  if (error) return { error: error.message };
  revalidatePath("/");
  return {};
}

// Rebuild a client's slug from its current name (slugs are set at creation and
// don't follow renames). Changes the client's /c/<slug> links. Returns the slug.
export async function regenerateClientSlug(
  clientId: string,
): Promise<ActionResult & { slug?: string }> {
  const supabase = await createClient();
  const { data: client } = await supabase
    .from("clients")
    .select("name")
    .eq("id", clientId)
    .maybeSingle();
  if (!client) return { error: "Client not found." };

  const root = slugify(client.name) || "client";
  for (let n = 1; n <= 50; n++) {
    const slug = n === 1 ? root : `${root}-${n}`;
    const { error } = await supabase
      .from("clients")
      .update({ slug })
      .eq("id", clientId);
    if (!error) {
      revalidatePath("/");
      revalidatePath(`/clients/${clientId}`);
      return { slug };
    }
    if (error.code !== "23505") return { error: error.message };
  }
  return { error: "Could not generate a unique slug." };
}

export async function deleteClient(clientId: string): Promise<ActionResult> {
  const supabase = await createClient();
  // Cascades to the client's sets, creatives, comments and contacts (FK rules).
  const { error } = await supabase.from("clients").delete().eq("id", clientId);
  if (error) return { error: error.message };
  revalidatePath("/");
  return {};
}

// ----- Sets ---------------------------------------------------------------

export async function addSet(
  clientId: string,
  name: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  if (!clientId) return { error: "Missing client." };
  const clean = name.trim() || "Untitled set";

  // Create the set, capturing its id (RLS scopes client_id to the agency).
  const root = slugify(clean) || "set";
  let setId: string | undefined;
  for (let n = 1; n <= 50; n++) {
    const slug = n === 1 ? root : `${root}-${n}`;
    const { data, error } = await supabase
      .from("creative_sets")
      .insert({ client_id: clientId, name: clean, slug })
      .select("id")
      .single();
    if (!error) {
      setId = data.id as string;
      break;
    }
    if (error.code !== "23505") return { error: error.message };
  }
  if (!setId) return { error: "Could not create the set." };

  // Open with one creative ready to go, brand prefilled from the client.
  const { data: cl } = await supabase
    .from("clients")
    .select("brand_name, brand_logo, name")
    .eq("id", clientId)
    .maybeSingle();
  const { error: adError } = await supabase.from("ads").insert({
    set_id: setId,
    position: 0,
    format: "fb-feed",
    brand_name: cl?.brand_name || cl?.name || "",
    brand_logo: cl?.brand_logo || "",
  });
  if (adError) {
    // Roll back the empty set so we don't leave an orphan with no creatives,
    // and surface the real failure instead of silently "succeeding".
    await supabase.from("creative_sets").delete().eq("id", setId);
    return { error: adError.message };
  }

  revalidatePath("/");
  return {};
}

export async function updateSet(
  setId: string,
  patch: { name?: string; due_date?: string | null },
): Promise<ActionResult> {
  const supabase = await createClient();
  const fields: Record<string, unknown> = {};
  if (patch.name !== undefined) fields.name = patch.name.trim() || "Untitled set";
  if (patch.due_date !== undefined) fields.due_date = patch.due_date || null;

  const { error } = await supabase
    .from("creative_sets")
    .update(fields)
    .eq("id", setId);
  if (error) return { error: error.message };
  revalidatePath("/");
  return {};
}

export async function deleteSet(setId: string): Promise<ActionResult> {
  const supabase = await createClient();
  // Cascades to the set's creatives, comments and replies (FK rules).
  const { error } = await supabase.from("creative_sets").delete().eq("id", setId);
  if (error) return { error: error.message };
  revalidatePath("/");
  return {};
}
