import { signIn, signInWithMagicLink, signUp } from "./actions";

export default async function LoginPage(props: {
  searchParams: Promise<{ error?: string; sent?: string }>;
}) {
  const { error, sent } = await props.searchParams;

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-6 py-16">
      <h1 className="mb-1 text-xl font-semibold">📐 Creative Review</h1>
      <p className="mb-6 text-sm text-neutral-500">Team sign in</p>

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
        <label className="block text-xs text-neutral-500">
          Password
          <input
            name="password"
            type="password"
            autoComplete="current-password"
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

        <div className="flex gap-2 pt-1">
          <button
            formAction={signIn}
            className="flex-1 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Sign in
          </button>
          <button
            formAction={signUp}
            className="flex-1 rounded-lg border border-neutral-700 px-4 py-2 text-sm font-medium text-indigo-300 hover:bg-neutral-800"
          >
            Create account
          </button>
        </div>

        <div className="border-t border-neutral-800 pt-3">
          <button
            formAction={signInWithMagicLink}
            className="w-full rounded-lg border border-neutral-700 px-4 py-2 text-sm font-medium text-neutral-200 hover:bg-neutral-800"
          >
            Email me a sign-in link
          </button>
          <p className="mt-1.5 text-center text-xs text-neutral-400">
            Invited by your team? Enter your email above and use this — no
            password needed.
          </p>
        </div>
      </form>
    </main>
  );
}
