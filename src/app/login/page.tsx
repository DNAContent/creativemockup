import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import LoginForm from "./LoginForm";
import { HelixLogo } from "@/components/icons";

export default async function LoginPage(props: {
  searchParams: Promise<{ error?: string; sent?: string }>;
}) {
  const { error } = await props.searchParams;

  // Already signed in? Send them on — "/" routes staff to the dashboard and
  // clients to /c.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/");

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-6 py-16">
      <h1 className="mb-1 flex items-center gap-2 text-xl font-semibold">
        <HelixLogo className="text-indigo-400" /> Helix
      </h1>
      <p className="mb-6 text-sm text-neutral-500">Team sign in</p>

      <LoginForm initialError={error} />
    </main>
  );
}
