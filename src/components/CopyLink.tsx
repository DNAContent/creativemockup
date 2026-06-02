"use client";

import { useState } from "react";
import { CheckIcon, LinkIcon } from "@/components/icons";

// Builds the absolute client review URL (/c/<client>/<set>) and copies it.
export default function CopyLink({
  clientSlug,
  setSlug,
}: {
  clientSlug: string | null;
  setSlug: string | null;
}) {
  const [copied, setCopied] = useState(false);
  const disabled = !clientSlug || !setSlug;

  async function copy() {
    if (disabled) return;
    const url = `${window.location.origin}/c/${clientSlug}/${setSlug}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // Clipboard blocked (permissions/focus) — fall back to a prompt.
      window.prompt("Copy this review link:", url);
    }
  }

  return (
    <button
      onClick={copy}
      disabled={disabled}
      title={disabled ? "Set needs a slug first" : undefined}
      className="flex items-center gap-1.5 rounded-lg border border-neutral-700 px-3 py-1.5 text-xs font-medium text-indigo-300 hover:bg-neutral-800 disabled:opacity-40"
    >
      {copied ? <CheckIcon className="h-3.5 w-3.5" /> : <LinkIcon className="h-3.5 w-3.5" />}
      {copied ? "Copied!" : "Copy review link"}
    </button>
  );
}
