import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import EditorClient, { type EditorCreative } from "./EditorClient";
import type { SetStatus } from "@/lib/types";

// Staff editor for a creative set: add / edit / delete / reorder creatives,
// set the set's status, and resolve client comments.
export default async function EditorPage(props: {
  params: Promise<{ setId: string }>;
}) {
  const { setId } = await props.params;

  const supabase = await createClient();
  // The proxy already validated the session on this request; just confirm one
  // is present (getClaims reads it locally when possible — see src/app/page.tsx).
  const { data: claimsData } = await supabase.auth.getClaims();
  if (!claimsData?.claims) redirect("/login");

  // Staff-only surface. RLS already blocks client-tier writes, but an
  // allowlisted client could otherwise SELECT a set and load the editor UI.
  // Require agency membership and send everyone else through "/", which
  // enrolls real staff and bounces clients to their /c portal.
  //
  // The membership gate, the set, and its creatives are independent reads (RLS
  // protects each), so fetch them in one parallel batch rather than three
  // serial cross-region round trips. The !membership redirect below still fires
  // before any data is rendered, so no set data reaches a non-staff caller.
  const [{ data: membership }, { data: set }, { data: creatives }] =
    await Promise.all([
      supabase
        .from("agency_members")
        .select("agency_id")
        .limit(1)
        .maybeSingle(),
      supabase
        .from("creative_sets")
        .select("id,name,slug,status,clients(id,name,slug)")
        .eq("id", setId)
        .maybeSingle(),
      supabase
        .from("ads")
        .select(
          "*, comments(id,author,text,target,resolved,created_at, replies(id,author,text,created_at))",
        )
        .eq("set_id", setId)
        .order("position")
        .returns<EditorCreative[]>(),
    ]);
  if (!membership) redirect("/");
  if (!set) notFound();

  const cl = set.clients as
    | { id?: string; name?: string; slug?: string | null }
    | null;
  const clientName = cl?.name ?? "";
  const clientId = cl?.id ?? "";
  const clientSlug = cl?.slug ?? null;

  return (
    <div className="flex-1">
      <AppHeader
        title={
          <span className="flex min-w-0 items-center gap-1.5 text-sm font-normal">
            <Link
              href="/"
              className="hidden shrink-0 text-neutral-400 hover:text-white sm:inline"
            >
              Dashboard
            </Link>
            <span className="hidden text-neutral-600 sm:inline">/</span>
            <Link
              href={clientId ? `/clients/${clientId}` : "/"}
              className="shrink-0 text-neutral-400 hover:text-white"
            >
              {clientName || "Client"}
            </Link>
            <span className="text-neutral-600">/</span>
            <span className="truncate font-semibold text-neutral-100">
              {set.name}
            </span>
          </span>
        }
      />

      <EditorClient
        setId={setId}
        setName={set.name}
        clientName={clientName}
        clientId={clientId}
        clientSlug={clientSlug}
        setSlug={set.slug as string | null}
        status={set.status as SetStatus}
        initialCreatives={creatives ?? []}
      />
    </div>
  );
}
