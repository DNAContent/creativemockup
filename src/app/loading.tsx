// Skeleton shown while the dashboard (clients list) loads.
export default function Loading() {
  return (
    <div className="flex-1">
      <div className="flex h-[57px] items-center justify-between border-b border-neutral-800 bg-neutral-900 px-6">
        <div className="h-4 w-40 animate-pulse rounded bg-neutral-800" />
        <div className="h-7 w-24 animate-pulse rounded-lg bg-neutral-800" />
      </div>
      <main className="mx-auto w-full max-w-4xl animate-pulse px-6 py-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="h-4 w-24 rounded bg-neutral-800" />
          <div className="h-9 w-28 rounded-lg bg-neutral-800" />
        </div>
        <div className="overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 border-t border-neutral-800 px-4 py-3 first:border-t-0">
              <div className="h-8 w-8 rounded bg-neutral-800" />
              <div className="h-4 w-40 rounded bg-neutral-800" />
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
