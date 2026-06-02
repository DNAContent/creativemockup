import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { signOut } from "./login/actions";
import AppHeader, { HeaderLink } from "@/components/AppHeader";
import DashboardClient, { type HomeClient } from "./DashboardClient";

export default async function Dashboard() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  let { data: membership } = await supabase
    .from("agency_members")
    .select("agency_id, role, agencies(name)")
    .limit(1)
    .maybeSingle();
  // Single-agency mode: auto-enroll the user if their email is authorized
  // staff (master or on the allowlist). See db/08_roles_and_staff.sql.
  if (!membership) {
    await supabase.rpc("join_default_agency");
    ({ data: membership } = await supabase
      .from("agency_members")
      .select("agency_id, role, agencies(name)")
      .limit(1)
      .maybeSingle());
  }
  // Signed in but not authorized staff — the join RPC didn't enroll them.
  if (!membership) {
    return (
      <main className="mx-auto w-full max-w-md flex-1 px-6 py-16">
        <h1 className="mb-1 text-xl font-semibold">No access yet</h1>
        <p className="mb-6 text-sm text-neutral-500">
          <strong>{user.email}</strong> isn&apos;t authorized for this workspace.
          Ask an owner to add your email under Team members.
        </p>
        <form action={signOut}>
          <button className="rounded-lg border border-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-800">
            Sign out
          </button>
        </form>
      </main>
    );
  }

  const agencyName =
    (membership.agencies as { name?: string } | null)?.name ?? "Your agency";

  const { data: clients } = await supabase
    .from("clients")
    .select("id,name,logo_url,brand_logo,contact_email,creative_sets(id,status)")
    .order("created_at", { ascending: true })
    .returns<HomeClient[]>();

  return (
    <div className="flex-1">
      <AppHeader
        title={`📐 ${agencyName}`}
        right={
          <>
            <HeaderLink href="/settings/team">Team &amp; access</HeaderLink>
            <span className="hidden sm:inline">{user.email}</span>
            <form action={signOut}>
              <button className="rounded-lg border border-neutral-700 px-3 py-1.5 text-xs text-neutral-200 hover:bg-neutral-800">
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
