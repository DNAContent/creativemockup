"use client";

import Link from "next/link";
import ViewToggle, { useViewMode } from "@/components/ViewToggle";
import Logo from "@/components/Logo";
import { SET_STATUS_LABELS, SET_STATUS_PILL, type SetStatus } from "@/lib/types";

export type ReviewSet = {
  set_name: string;
  set_slug: string;
  status: SetStatus;
  due_date: string | null;
};
export type ReviewGroup = {
  name: string;
  slug: string;
  logo: string | null;
  sets: ReviewSet[];
};

export default function ReviewsDashboard({ groups }: { groups: ReviewGroup[] }) {
  const [view, setView] = useViewMode("reviews-view", "list");
  const total = groups.reduce((n, g) => n + g.sets.length, 0);

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold">
          Reviews{" "}
          <span className="font-normal text-neutral-400">({total})</span>
        </h2>
        {total > 0 && <ViewToggle value={view} onChange={setView} />}
      </div>

      {groups.map((g) => (
        <div key={g.slug} className="mb-5">
          <div className="mb-2 flex items-center gap-2.5">
            <Logo
              src={g.logo}
              name={g.name}
              imgClassName="h-8 w-8 rounded-lg object-cover"
              fallbackClassName="grid h-8 w-8 place-items-center rounded-lg bg-neutral-800 text-xs text-neutral-400"
            />
            <h3 className="text-sm font-semibold">{g.name}</h3>
          </div>

          {view === "card" ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {g.sets.map((s) => (
                <Link
                  key={s.set_slug}
                  href={`/c/${g.slug}/${s.set_slug}`}
                  className="rounded-xl border border-neutral-800 bg-neutral-900 p-4 hover:-translate-y-0.5 hover:border-neutral-700 hover:bg-neutral-800/50 hover:shadow-lg hover:shadow-black/20"
                >
                  <div className="text-sm font-medium">{s.set_name}</div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] ${SET_STATUS_PILL[s.status]}`}
                    >
                      {SET_STATUS_LABELS[s.status]}
                    </span>
                    {s.due_date && (
                      <span className="text-xs text-neutral-500">
                        due {s.due_date}
                      </span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900">
              {g.sets.map((s) => (
                <Link
                  key={s.set_slug}
                  href={`/c/${g.slug}/${s.set_slug}`}
                  className="flex items-center justify-between gap-2 border-t border-neutral-800 px-4 py-2.5 first:border-t-0 hover:bg-neutral-800/60"
                >
                  <span className="min-w-0 text-sm">
                    <span className="font-medium">{s.set_name}</span>{" "}
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] ${SET_STATUS_PILL[s.status]}`}
                    >
                      {SET_STATUS_LABELS[s.status]}
                    </span>
                    {s.due_date && (
                      <span className="text-neutral-500"> · due {s.due_date}</span>
                    )}
                  </span>
                  <span className="shrink-0 text-xs text-neutral-500">Open →</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      ))}
    </main>
  );
}
