import { createClient } from "@/lib/supabase/server";
import AppHeader from "@/components/AppHeader";
import { HelixLogo, LogoutIcon, MailIcon } from "@/components/icons";
import type { SetStatus } from "@/lib/types";
import ReviewsDashboard, { type ReviewGroup } from "./ReviewsDashboard";
import { clientSignIn, clientSignOut } from "./actions";

type SetRow = {
  client_name: string;
  client_slug: string;
  client_logo: string | null;
  set_name: string;
  set_slug: string;
  status: SetStatus;
  due_date: string | null;
  role: string;
};

export default async function ClientHome(props: {
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const { sent, error } = await props.searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Not signed in: email a magic link to come back here.
  if (!user) {
    return (
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-6 py-16">
        <h1 className="mb-1 flex items-center gap-2 text-xl font-semibold">
          <HelixLogo className="text-indigo-400" /> Your reviews
        </h1>
        <p className="mb-6 text-sm text-neutral-400">
          Sign in with the email your agency invited.
        </p>
        <form className="space-y-3 rounded-xl border border-neutral-800 bg-neutral-900 p-5">
          <label className="block text-xs text-neutral-400">
            Email
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              className="mt-1 w-full rounded-lg border border-neutral-700 px-3 py-2 text-sm text-neutral-100"
            />
          </label>
          {sent && (
            <p className="rounded-lg bg-green-500/15 px-3 py-2 text-sm text-green-300">
              Check your email for a sign-in link.
            </p>
          )}
          {error && (
            <p className="rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-300">
              {error}
            </p>
          )}
          <button
            formAction={clientSignIn}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            <MailIcon className="h-4 w-4" />
            Email me a sign-in link
          </button>
        </form>
      </main>
    );
  }

  const { data } = await supabase.rpc("my_creative_sets");
  const rows = (data as SetRow[]) ?? [];

  // Group sets under their client.
  const groups = new Map<string, ReviewGroup>();
  for (const r of rows) {
    const g =
      groups.get(r.client_slug) ??
      ({ name: r.client_name, slug: r.client_slug, logo: r.client_logo, sets: [] } as ReviewGroup);
    g.sets.push({
      set_name: r.set_name,
      set_slug: r.set_slug,
      status: r.status,
      due_date: r.due_date,
    });
    groups.set(r.client_slug, g);
  }
  const clientGroups = [...groups.values()];

  return (
    <div className="flex-1">
      <AppHeader
        title={
          <span className="flex items-center gap-2">
            <HelixLogo className="text-indigo-400" /> Your reviews
          </span>
        }
        right={
          <>
            <span className="hidden sm:inline">{user.email}</span>
            <form action={clientSignOut}>
              <button className="flex items-center gap-1.5 rounded-lg border border-neutral-700 px-3 py-1.5 text-xs text-neutral-200 hover:bg-neutral-800">
                <LogoutIcon className="h-3.5 w-3.5" /> Sign out
              </button>
            </form>
          </>
        }
      />

      {clientGroups.length === 0 ? (
        <main className="mx-auto w-full max-w-3xl px-6 py-6">
          <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-6 text-sm text-neutral-400">
            No reviews have been shared with {user.email} yet. Your agency will
            add you when something&apos;s ready.
          </div>
        </main>
      ) : (
        <ReviewsDashboard groups={clientGroups} />
      )}
    </div>
  );
}
