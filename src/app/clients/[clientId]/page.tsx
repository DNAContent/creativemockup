import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import AppHeader, { HeaderLink } from "@/components/AppHeader";
import ClientPageClient, { type ClientDetail } from "./ClientPageClient";

export default async function ClientPage(props: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await props.params;
  const supabase = await createClient();
  // The proxy already validated the session on this request; just confirm one
  // is present (getClaims reads it locally when possible — see src/app/page.tsx).
  const { data: claimsData } = await supabase.auth.getClaims();
  if (!claimsData?.claims) redirect("/login");

  const { data: client } = await supabase
    .from("clients")
    .select(
      "id,name,slug,logo_url,brand_name,brand_logo, creative_sets(id,name,slug,status,due_date), client_contacts(id,email,name,can_comment,can_approve,can_edit,is_primary)",
    )
    // Deterministic primary: flagged-primary first, else oldest contact.
    .order("is_primary", { referencedTable: "client_contacts", ascending: false })
    .order("created_at", { referencedTable: "client_contacts", ascending: true })
    .eq("id", clientId)
    .maybeSingle();
  if (!client) notFound();

  return (
    <div className="flex-1">
      <AppHeader
        title={client.name}
        right={<HeaderLink href="/">← Dashboard</HeaderLink>}
      />
      <ClientPageClient client={client as unknown as ClientDetail} />
    </div>
  );
}
