import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import { SET_STATUS_LABELS, type SetStatus } from "@/lib/types";
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

type Group = {
  name: string;
  slug: string;
  logo: string | null;
  sets: SetRow[];
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
        <h1 className="mb-1 text-xl font-semibold">Your reviews</h1>
        <p className="mb-6 text-sm text-neutral-400">
          Sign in with the email your agency invited.
        </p>
        <form className="space-y-3 rounded-xl border border-neutral-800 bg-neutral-900 p-5">
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
  const rows = (data as SetRow[]) ?? [];

  // Group sets under their client.
  const groups = new Map<string, Group>();
  for (const r of rows) {
    const g =
      groups.get(r.client_slug) ??
      ({ name: r.client_name, slug: r.client_slug, logo: r.client_logo, sets: [] } as Group);
    g.sets.push(r);
    groups.set(r.client_slug, g);
  }
  const clientGroups = [...groups.values()];

  return (
    <div className="flex-1">
      <AppHeader
        title="Your reviews"
        right={
          <>
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
        {clientGroups.length === 0 ? (
          <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-6 text-sm text-neutral-400">
            No reviews have been shared with {user.email} yet. Your agency will
            add you when something&apos;s ready.
          </div>
        ) : (
          clientGroups.map((g) => (
            <div
              key={g.slug}
              className="mb-4 rounded-xl border border-neutral-800 bg-neutral-900"
            >
              <div className="flex items-center gap-2 border-b border-neutral-800 px-4 py-3">
                {g.logo && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={g.logo}
                    alt=""
                    className="h-6 w-6 rounded object-cover"
                  />
                )}
                <h2 className="text-sm font-semibold">{g.name}</h2>
              </div>
              <div className="p-2">
                {g.sets.map((s) => (
                  <Link
                    key={s.set_slug}
                    href={`/c/${g.slug}/${s.set_slug}`}
                    className="flex items-center justify-between gap-2 rounded-lg px-2 py-2.5 hover:bg-neutral-800"
                  >
                    <span className="min-w-0 text-sm">
                      <span className="font-medium">{s.set_name}</span>{" "}
                      <span className="rounded-full bg-indigo-500/15 px-2 py-0.5 text-[11px] text-indigo-300">
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
            </div>
          ))
        )}
      </main>
    </div>
  );
}
