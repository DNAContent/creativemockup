import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { signOut } from "./login/actions";
import AppHeader, { HeaderLink } from "@/components/AppHeader";
import { HelixLogo, LogoutIcon } from "@/components/icons";
import DashboardClient, { type HomeClient } from "./DashboardClient";

export default async function Dashboard() {
  const supabase = await createClient();
  // The proxy (src/proxy.ts) already ran the authoritative, network-validating
  // getUser() on this request and gated the route, so here we only READ the
  // validated identity. getClaims() verifies the JWT locally when asymmetric
  // signing keys are enabled (no cross-region hop to Supabase) and falls back to
  // getUser() otherwise — never slower than the old call.
  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims;
  if (!claims) redirect("/login");
  const email = typeof claims.email === "string" ? claims.email : "";

  const selectClients = () =>
    supabase
      .from("clients")
      .select("id,name,logo_url,brand_logo,creative_sets(id,status),client_contacts(email,is_primary)")
      .order("created_at", { ascending: true })
      // Deterministic primary: flagged-primary first, else oldest contact.
      .order("is_primary", { referencedTable: "client_contacts", ascending: false })
      .order("created_at", { referencedTable: "client_contacts", ascending: true })
      .returns<HomeClient[]>();

  // Membership and the client list are independent — RLS scopes the client list
  // to the caller — so fetch them together instead of serially. Each Supabase
  // query is a cross-region round trip (see proxy.ts), so collapsing two serial
  // hops into one parallel batch shaves a full round trip off the common
  // (already-enrolled) path.
  const [{ data: membership }, { data: clientsInitial }] = await Promise.all([
    supabase
      .from("agency_members")
      .select("agency_id, agencies(name)")
      .limit(1)
      .maybeSingle(),
    selectClients(),
  ]);

  let agencyName = (membership?.agencies as { name?: string } | null)?.name;
  let clients = clientsInitial;

  // Not enrolled yet? Single-agency auto-enroll, gated by the staff allowlist
  // (master or invited teammate). We trust join_default_agency's RETURN VALUE —
  // it performs the insert and returns the agency in one SECURITY DEFINER txn.
  // Re-selecting agency_members here instead can miss the row we just inserted
  // (read-after-write across requests) and wrongly bounce a brand-new teammate
  // to /c. A null return means the caller isn't staff → send them to /c.
  if (!membership) {
    const { data: joined } = await supabase.rpc("join_default_agency");
    if (!joined) redirect("/c");
    agencyName = (joined as { name?: string } | null)?.name ?? agencyName;
    // The parallel client fetch above ran before enrollment, so RLS returned
    // nothing — re-fetch now that the membership row exists.
    ({ data: clients } = await selectClients());
  }

  const displayAgency = agencyName ?? "Your agency";

  return (
    <div className="flex-1">
      <AppHeader
        title={
          <span className="flex items-center gap-2">
            <HelixLogo className="text-indigo-400" />
            {displayAgency}
          </span>
        }
        right={
          <>
            <HeaderLink href="/settings/team">Team &amp; access</HeaderLink>
            <span className="hidden sm:inline">{email}</span>
            <form action={signOut}>
              <button className="flex items-center gap-1.5 rounded-lg border border-neutral-700 px-3 py-1.5 text-xs text-neutral-200 hover:bg-neutral-800">
                <LogoutIcon className="h-3.5 w-3.5" />
                Sign out
              </button>
            </form>
          </>
        }
      />
      <DashboardClient clients={clients ?? []} />
    </div>
  );
}
