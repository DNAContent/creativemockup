// Skeleton shown while the client review portal loads.
export default function Loading() {
  return (
    <div className="flex h-dvh flex-col">
      <div className="h-[57px] border-b border-neutral-800 bg-neutral-900" />
      <div className="flex min-h-0 flex-1 animate-pulse">
        <aside className="w-60 shrink-0 space-y-2 border-r border-neutral-800 bg-neutral-950 p-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-11 rounded-lg bg-neutral-800/60" />
          ))}
        </aside>
        <section className="flex flex-1 items-center justify-center bg-neutral-950">
          <div className="h-80 w-80 rounded-xl bg-neutral-800/50" />
        </section>
        <aside className="w-96 shrink-0 space-y-3 border-l border-neutral-800 bg-neutral-900 p-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-9 rounded-lg bg-neutral-800/60" />
          ))}
        </aside>
      </div>
    </div>
  );
}
