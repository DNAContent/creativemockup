import { createClient } from "@/lib/supabase/server";
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

  const { data: creatives } = await supabase
    .from("ads")
    .select(
      "*, comments(id,author,text,target,resolved,created_at, replies(id,author,text,created_at))",
    )
    .eq("set_id", set.id)
    .order("position")
    .returns<PortalCreative[]>();

  // This contact's granular capabilities for the set (view is implicit).
  const [{ data: canComment }, { data: canApprove }, { data: canEdit }] =
    await Promise.all([
      supabase.rpc("client_can_comment_set", { p_set_id: set.id }),
      supabase.rpc("client_can_approve_set", { p_set_id: set.id }),
      supabase.rpc("client_can_edit_set", { p_set_id: set.id }),
    ]);

  // The embedded relation may be typed as an object or a single-element array
  // depending on inference; normalize to one object.
  const clientRel = set.clients as
    | { name: string; logo_url: string | null }
    | { name: string; logo_url: string | null }[];
  const client = Array.isArray(clientRel) ? clientRel[0] : clientRel;

  return (
    <PortalClient
      setName={set.name}
      notes={set.notes}
      client={client}
      caps={{
        comment: !!canComment,
        approve: !!canApprove,
        edit: !!canEdit,
      }}
      userEmail={user.email ?? ""}
      initialCreatives={creatives ?? []}
    />
  );
}
