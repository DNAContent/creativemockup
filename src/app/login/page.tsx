import LoginButtons from "./LoginButtons";
import { HelixLogo } from "@/components/icons";

export default async function LoginPage(props: {
  searchParams: Promise<{ error?: string; sent?: string }>;
}) {
  const { error, sent } = await props.searchParams;

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-6 py-16">
      <h1 className="mb-1 flex items-center gap-2 text-xl font-semibold">
        <HelixLogo className="text-indigo-400" /> Helix
      </h1>
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

        <LoginButtons />
      </form>
    </main>
  );
}
