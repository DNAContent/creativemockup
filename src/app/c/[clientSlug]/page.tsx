import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import { SET_STATUS_LABELS, SET_STATUS_PILL, type SetStatus } from "@/lib/types";
import { clientSignIn, clientSignOut } from "../actions";

type SetRow = {
  client_name: string;
  client_slug: string;
  client_logo: string | null;
  set_name: string;
  set_slug: string;
  status: SetStatus;
  due_date: string | null;
};

// Per-client review dashboard: /c/<clientSlug> — just that client's sets.
export default async function ClientDashboard(props: {
  params: Promise<{ clientSlug: string }>;
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const { clientSlug } = await props.params;
  const { sent, error } = await props.searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-6 py-16">
        <h1 className="mb-1 text-xl font-semibold">Your reviews</h1>
        <p className="mb-6 text-sm text-neutral-400">
          Sign in with the email your agency invited.
        </p>
        <form className="space-y-3 rounded-xl border border-neutral-800 bg-neutral-900 p-5">
          {/* Funnel all client sign-ins to the unified /c dashboard. */}
          <input type="hidden" name="next" value="/c" />
          <label className="block text-xs text-neutral-500">
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
            className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Email me a sign-in link
          </button>
        </form>
      </main>
    );
  }

  const { data } = await supabase.rpc("my_creative_sets");
  const sets = ((data as SetRow[]) ?? []).filter(
    (r) => r.client_slug === clientSlug,
  );

  if (sets.length === 0) {
    return (
      <main className="mx-auto w-full max-w-md flex-1 px-6 py-16">
        <h1 className="mb-1 text-xl font-semibold">Nothing here</h1>
        <p className="mb-6 text-sm text-neutral-400">
          No reviews are shared with {user.email} for this client.
        </p>
        <Link href="/c" className="text-sm text-indigo-300 hover:underline">
          ← All your reviews
        </Link>
      </main>
    );
  }

  const clientName = sets[0].client_name;
  const logo = sets[0].client_logo;

  return (
    <div className="flex-1">
      <AppHeader
        title={
          <span className="flex items-center gap-2">
            {logo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt="" className="h-6 w-6 rounded object-cover" />
            )}
            {clientName}
          </span>
        }
        right={
          <>
            <Link href="/c" className="shrink-0 text-indigo-300 hover:text-white">
              All reviews
            </Link>
            <span className="hidden sm:inline">{user.email}</span>
            <form action={clientSignOut}>
              <button className="rounded-lg border border-neutral-700 px-3 py-1.5 text-xs text-neutral-200 hover:bg-neutral-800">
                Sign out
              </button>
            </form>
          </>
        }
      />

      <main className="mx-auto w-full max-w-3xl px-6 py-6">
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-2">
          {sets.map((s) => (
            <Link
              key={s.set_slug}
              href={`/c/${clientSlug}/${s.set_slug}`}
              className="flex items-center justify-between gap-2 rounded-lg px-2 py-2.5 hover:bg-neutral-800"
            >
              <span className="min-w-0 text-sm">
                <span className="font-medium">{s.set_name}</span>{" "}
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] ${SET_STATUS_PILL[s.status]}`}
                >
                  {SET_STATUS_LABELS[s.status]}
                </span>
                {s.due_date && (
                  <span className="text-neutral-500"> · due {s.due_date}</span>
                )}
              </span>
              <span className="text-xs text-neutral-500">Open →</span>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
