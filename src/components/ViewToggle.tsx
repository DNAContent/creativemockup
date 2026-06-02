"use client";

import { useEffect, useState } from "react";

export type ViewMode = "list" | "card";

// View-mode state persisted to localStorage (per key). Starts at `initial` on
// the server/first paint, then adopts the stored value to avoid hydration drift.
export function useViewMode(
  key: string,
  initial: ViewMode = "list",
): [ViewMode, (m: ViewMode) => void] {
  const [mode, setMode] = useState<ViewMode>(initial);
  useEffect(() => {
    try {
      const stored = localStorage.getItem(key);
      if (stored === "list" || stored === "card") setMode(stored);
    } catch {}
  }, [key]);
  const set = (m: ViewMode) => {
    setMode(m);
    try {
      localStorage.setItem(key, m);
    } catch {}
  };
  return [mode, set];
}

export default function ViewToggle({
  value,
  onChange,
}: {
  value: ViewMode;
  onChange: (m: ViewMode) => void;
}) {
  const btn = (active: boolean) =>
    `grid h-8 w-8 place-items-center rounded-md ${
      active ? "bg-neutral-800 text-neutral-100" : "text-neutral-500 hover:text-neutral-300"
    }`;
  return (
    <div className="inline-flex rounded-lg border border-neutral-700 p-0.5">
      <button onClick={() => onChange("list")} className={btn(value === "list")} aria-label="List view" title="List view">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
          <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
        </svg>
      </button>
      <button onClick={() => onChange("card")} className={btn(value === "card")} aria-label="Card view" title="Card view">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
          <rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
        </svg>
      </button>
    </div>
  );
}
