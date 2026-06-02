"use client";

import { useState } from "react";
import { Spinner } from "@/components/icons";

// A button that manages its own loading state: it awaits the async onClick,
// shows a spinner (and optional busyLabel) while in flight, and disables itself
// so writes can't be double-submitted. Use for anything that hits the DB.
export default function ActionButton({
  onClick,
  children,
  className,
  icon,
  disabled,
  busyLabel,
  title,
  ariaLabel,
}: {
  onClick: () => Promise<unknown> | void;
  children: React.ReactNode;
  className?: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  busyLabel?: string;
  title?: string;
  ariaLabel?: string;
}) {
  const [busy, setBusy] = useState(false);
  async function run() {
    if (busy) return;
    setBusy(true);
    try {
      await onClick();
    } finally {
      setBusy(false);
    }
  }
  return (
    <button
      type="button"
      onClick={run}
      disabled={busy || disabled}
      aria-busy={busy}
      title={title}
      aria-label={ariaLabel}
      className={className}
    >
      {busy ? <Spinner className="h-3.5 w-3.5" /> : icon}
      {busy && busyLabel ? busyLabel : children}
    </button>
  );
}
