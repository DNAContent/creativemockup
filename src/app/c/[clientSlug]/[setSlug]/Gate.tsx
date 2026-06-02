"use client";

import { useState } from "react";
import { requestAccessOrSignIn } from "./actions";

// Email gate: enter email -> if allowlisted, a magic link is sent; otherwise an
// access request is logged for the internal team.
export default function Gate({
  clientSlug,
  setSlug,
  deniedEmail,
}: {
  clientSlug: string;
  setSlug: string;
  deniedEmail?: string;
}) {
  const [state, setState] = useState<
    "idle" | "sending" | "sent" | "requested"
  >("idle");
  const [error, setError] = useState("");

  async function action(formData: FormData) {
    setError("");
    setState("sending");
    const res = await requestAccessOrSignIn(clientSlug, setSlug, formData);
    if (res.error) {
      setError(res.error);
      setState("idle");
    } else if (res.sent) {
      setState("sent");
    } else {
      setState("requested");
    }
  }

  if (state === "sent") {
    return (
      <Centered title="Check your email">
        We sent you a magic link. Click it to open this review — no password
        needed.
      </Centered>
    );
  }

  if (state === "requested") {
    return (
      <Centered title="Access requested">
        That email isn&apos;t on the list for this review yet. We&apos;ve let the
        team know — they&apos;ll add you and you&apos;ll get a link by email.
      </Centered>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-6 py-16">
      <h1 className="mb-1 text-xl font-semibold">📐 Creative review</h1>
      <p className="mb-6 text-sm text-neutral-500">
        {deniedEmail
          ? `${deniedEmail} doesn't have access to this review. Request access below.`
          : "Enter your email to access this review."}
      </p>

      <form
        action={action}
        className="space-y-3 rounded-xl border border-neutral-800 bg-neutral-900 p-5"
      >
        <label className="block text-xs text-neutral-500">
          Email
          <input
            name="email"
            type="email"
            required
            defaultValue={deniedEmail}
            autoComplete="email"
            className="mt-1 w-full rounded-lg border border-neutral-700 px-3 py-2 text-sm text-neutral-100"
          />
        </label>
        <label className="block text-xs text-neutral-500">
          Note to the team (optional)
          <textarea
            name="message"
            rows={2}
            placeholder="e.g. I'm the brand manager at Acme"
            className="mt-1 w-full rounded-lg border border-neutral-700 px-3 py-2 text-sm text-neutral-100"
          />
        </label>

        {error && (
          <p className="rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        )}

        <button
          disabled={state === "sending"}
          className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {state === "sending" ? "…" : "Continue"}
        </button>
      </form>
    </main>
  );
}

function Centered({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-6 py-16">
      <h1 className="mb-2 text-lg font-semibold">{title}</h1>
      <p className="text-sm text-neutral-500">{children}</p>
    </main>
  );
}
