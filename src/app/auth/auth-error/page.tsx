import Link from "next/link";

// Landing for a failed/expired magic link (auth/callback redirects here when
// the code/OTP can't be exchanged). Public route — see PUBLIC_PREFIXES in
// src/lib/supabase/proxy.ts. `next` carries the page the user was trying to
// reach so we can send them back to request a fresh link.
export default async function AuthError(props: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await props.searchParams;
  // Only honour same-site relative paths to avoid an open-redirect.
  const backTo = next && next.startsWith("/") ? next : "/";

  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-md flex-col items-center justify-center px-6 text-center">
      <h1 className="text-lg font-semibold">This link didn’t work</h1>
      <p className="mt-2 text-sm text-neutral-500">
        Your sign-in link is invalid or has expired. Magic links can only be
        used once and time out after a while — just request a new one.
      </p>
      <Link
        href={backTo}
        className="mt-5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
      >
        Request a new link
      </Link>
    </main>
  );
}
