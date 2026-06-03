import { createClient } from "@/lib/supabase/server";
import type { SetStatus } from "@/lib/types";
import Gate from "./Gate";
import PortalClient, { type PortalCreative } from "./PortalClient";

// Public client review portal at /c/<client>/<set>. Access is gated by the
// magic-link allowlist (client_contacts) — not by URL secrecy — so slugs are safe.
export default async function ReviewPortal(props: {
  params: Promise<{ clientSlug: string; setSlug: string }>;
}) {
  const { clientSlug, setSlug } = await props.params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Not signed in -> show the email gate.
  if (!user) return <Gate clientSlug={clientSlug} setSlug={setSlug} />;

  // Signed in: RLS only returns the set if this user's email is allowlisted.
  const { data: set } = await supabase
    .from("creative_sets")
    .select("id,name,status,notes, clients!inner(name,logo_url,slug)")
    .eq("slug", setSlug)
    .eq("clients.slug", clientSlug)
    .maybeSingle();

  if (!set) {
    return (
      <Gate
        clientSlug={clientSlug}
        setSlug={setSlug}
        deniedEmail={user.email ?? undefined}
      />
    );
  }

  // Fetch the creatives AND this contact's capabilities in parallel — the caps
  // RPCs only need set.id, so they shouldn't wait on the larger creatives read.
  //
  // The creatives are read on their OWN (no embedded comments). Embedding
  // comments(...replies(...)) makes PostgREST evaluate the client-side comment
  // RLS as part of the same statement; if that errors, it nulls the ENTIRE
  // result and the portal shows a set with no creatives. Comments are loaded
  // separately below and merged, so a comment-read hiccup degrades to "no
  // comments shown" instead of "nothing to review".
  const [
    { data: creatives, error: creativesErr },
    { data: canComment },
    { data: canApprove },
    { data: canEdit },
  ] = await Promise.all([
    supabase
      .from("ads")
      .select("*")
      .eq("set_id", set.id)
      .order("position")
      .returns<Omit<PortalCreative, "comments">[]>(),
    supabase.rpc("client_can_comment_set", { p_set_id: set.id }),
    supabase.rpc("client_can_approve_set", { p_set_id: set.id }),
    supabase.rpc("client_can_edit_set", { p_set_id: set.id }),
  ]);
  if (creativesErr) console.error("portal: creatives read failed", creativesErr);

  // Load comment threads for these creatives separately and group by ad.
  const ads = creatives ?? [];
  const byAd = new Map<string, PortalCreative["comments"]>();
  if (ads.length > 0) {
    const { data: comments, error: commentsErr } = await supabase
      .from("comments")
      .select(
        "id,ad_id,author,text,target,resolved,created_at, replies(id,author,text,created_at)",
      )
      .in(
        "ad_id",
        ads.map((a) => a.id),
      )
      .order("created_at")
      .returns<(PortalCreative["comments"][number] & { ad_id: string })[]>();
    if (commentsErr) console.error("portal: comments read failed", commentsErr);
    for (const { ad_id, ...c } of comments ?? []) {
      const list = byAd.get(ad_id) ?? [];
      list.push(c);
      byAd.set(ad_id, list);
    }
  }
  const initialCreatives: PortalCreative[] = ads.map((a) => ({
    ...a,
    comments: byAd.get(a.id) ?? [],
  }));

  // The embedded relation may be typed as an object or a single-element array
  // depending on inference; normalize to one object.
  const clientRel = set.clients as
    | { name: string; logo_url: string | null }
    | { name: string; logo_url: string | null }[];
  const client = Array.isArray(clientRel) ? clientRel[0] : clientRel;

  return (
    <PortalClient
      setId={set.id}
      setName={set.name}
      setStatus={set.status as SetStatus}
      notes={set.notes}
      client={client}
      caps={{
        comment: !!canComment,
        approve: !!canApprove,
        edit: !!canEdit,
      }}
      userEmail={user.email ?? ""}
      initialCreatives={initialCreatives}
    />
  );
}
