"use client";

import type { ContactCaps } from "@/lib/types";

const CAPS: { key: keyof ContactCaps; label: string }[] = [
  { key: "can_comment", label: "Comment" },
  { key: "can_approve", label: "Approve" },
  { key: "can_edit", label: "Edit" },
];

// Multi-select capabilities for a client contact. Every contact can view by
// default, so "View" isn't shown — only the optional capabilities are toggles.
export default function ContactCapsPicker({
  value,
  onChange,
  disabled,
}: {
  value: ContactCaps;
  onChange: (c: ContactCaps) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {CAPS.map(({ key, label }) => {
        const on = value[key];
        return (
          <button
            key={key}
            type="button"
            disabled={disabled}
            aria-pressed={on}
            onClick={() => onChange({ ...value, [key]: !on })}
            className={`rounded-full border px-2.5 py-1 text-[11px] disabled:opacity-50 ${
              on
                ? "border-indigo-500/40 bg-indigo-500/15 text-indigo-300"
                : "border-neutral-700 text-neutral-400 hover:bg-neutral-800"
            }`}
          >
            {on ? "✓ " : ""}
            {label}
          </button>
        );
      })}
    </div>
  );
}
