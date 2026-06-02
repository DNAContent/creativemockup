"use client";

import { useState } from "react";
import { signIn, signInWithMagicLink, signUp } from "./actions";
import { MailIcon, Spinner } from "@/components/icons";

// Client buttons for the login form: show a spinner on the action you clicked
// and disable the rest while a server action is in flight. (Server actions
// redirect on completion, which resets this on navigation.)
export default function LoginButtons() {
  const [pending, setPending] = useState<null | "in" | "up" | "magic">(null);
  const busy = pending !== null;

  return (
    <>
      <div className="flex gap-2 pt-1">
        <button
          formAction={signIn}
          onClick={() => setPending("in")}
          disabled={busy}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {pending === "in" && <Spinner />} Sign in
        </button>
        <button
          formAction={signUp}
          onClick={() => setPending("up")}
          disabled={busy}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-neutral-700 px-4 py-2 text-sm font-medium text-indigo-300 hover:bg-neutral-800 disabled:opacity-60"
        >
          {pending === "up" && <Spinner />} Create account
        </button>
      </div>

      <div className="border-t border-neutral-800 pt-3">
        <button
          formAction={signInWithMagicLink}
          onClick={() => setPending("magic")}
          disabled={busy}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-neutral-700 px-4 py-2 text-sm font-medium text-neutral-200 hover:bg-neutral-800 disabled:opacity-60"
        >
          {pending === "magic" ? <Spinner /> : <MailIcon className="h-4 w-4" />}
          Email me a sign-in link
        </button>
        <p className="mt-1.5 text-center text-xs text-neutral-400">
          Invited by your team? Enter your email above and use this — no password
          needed.
        </p>
      </div>
    </>
  );
}
