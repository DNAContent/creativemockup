import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import AppHeader, { HeaderLink } from "@/components/AppHeader";
import ClientPageClient, { type ClientDetail } from "./ClientPageClient";

export default async function ClientPage(props: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await props.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: client } = await supabase
    .from("clients")
    .select(
      "id,name,slug,logo_url,contact_email,brand_name,brand_logo, creative_sets(id,name,slug,status,due_date), client_contacts(id,email,name,can_comment,can_approve,can_edit)",
    )
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
