import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { signOut } from "./login/actions";
import AppHeader, { HeaderLink } from "@/components/AppHeader";
import { HelixLogo, LogoutIcon } from "@/components/icons";
import DashboardClient, { type HomeClient } from "./DashboardClient";

export default async function Dashboard() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("agency_members")
    .select("agency_id, agencies(name)")
    .limit(1)
    .maybeSingle();

  let agencyName = (membership?.agencies as { name?: string } | null)?.name;

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
  }

  const displayAgency = agencyName ?? "Your agency";

  const { data: clients } = await supabase
    .from("clients")
    .select("id,name,logo_url,brand_logo,contact_email,creative_sets(id,status)")
    .order("created_at", { ascending: true })
    .returns<HomeClient[]>();

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
            <span className="hidden sm:inline">{user.email}</span>
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
