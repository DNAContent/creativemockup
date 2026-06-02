"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { MailIcon, Spinner } from "@/components/icons";

// Client-side sign-in. We auth with the BROWSER Supabase client so the session
// cookie is written directly in the browser, then hard-navigate so the server
// sees it. (Doing this in a server action relied on the action's Set-Cookie
// surviving the redirect through the host, which it didn't — sign-in bounced
// back to /login and the spinner hung forever.) Errors reset the busy state so
// the form is always recoverable.
export default function LoginForm({ initialError }: { initialError?: string }) {
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<null | "in" | "up" | "magic">(null);
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [sent, setSent] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function signIn() {
    if (!email || !password) {
      setError("Enter your email and password.");
      return;
    }
    setBusy("in");
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      setBusy(null);
      return;
    }
    // Full navigation so the server picks up the freshly-written session cookie.
    window.location.assign("/");
  }

  async function signUp() {
    if (!email || !password) {
      setError("Enter your email and password.");
      return;
    }
    setBusy("up");
    setError(null);
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) {
      setError(error.message);
      setBusy(null);
      return;
    }
    if (!data.session) {
      // Email confirmation is ON — no session yet. Navigating home would just
      // bounce back to /login, so tell them to confirm first.
      setBusy(null);
      setNotice("Account created — check your email to confirm it, then sign in.");
      return;
    }
    window.location.assign("/?welcome=1");
  }

  async function magicLink() {
    if (!email) {
      setError("Enter your email first.");
      return;
    }
    setBusy("magic");
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/`,
      },
    });
    setBusy(null);
    if (error) {
      setError(error.message);
      return;
    }
    setSent(true);
  }

  const disabled = busy !== null;

  return (
    <div className="space-y-3 rounded-xl border border-neutral-800 bg-neutral-900 p-5">
      <label className="block text-xs text-neutral-400">
        Email
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          autoComplete="email"
          className="mt-1 w-full rounded-lg border border-neutral-700 px-3 py-2 text-sm text-neutral-100"
        />
      </label>
      <label className="block text-xs text-neutral-400">
        Password
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") signIn();
          }}
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
      {notice && (
        <p className="rounded-lg bg-green-500/15 px-3 py-2 text-sm text-green-300">
          {notice}
        </p>
      )}
      {error && (
        <p className="rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={signIn}
          disabled={disabled}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {busy === "in" && <Spinner />} Sign in
        </button>
        <button
          type="button"
          onClick={signUp}
          disabled={disabled}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-neutral-700 px-4 py-2 text-sm font-medium text-indigo-300 hover:bg-neutral-800 disabled:opacity-60"
        >
          {busy === "up" && <Spinner />} Create account
        </button>
      </div>

      <div className="border-t border-neutral-800 pt-3">
        <button
          type="button"
          onClick={magicLink}
          disabled={disabled}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-neutral-700 px-4 py-2 text-sm font-medium text-neutral-200 hover:bg-neutral-800 disabled:opacity-60"
        >
          {busy === "magic" ? <Spinner /> : <MailIcon className="h-4 w-4" />}
          Email me a sign-in link
        </button>
        <p className="mt-1.5 text-center text-xs text-neutral-400">
          Invited by your team? Enter your email above and use this — no password
          needed.
        </p>
      </div>
    </div>
  );
}
