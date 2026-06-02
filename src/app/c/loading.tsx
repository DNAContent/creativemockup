// Skeleton shown while the client "all reviews" dashboard loads.
export default function Loading() {
  return (
    <div className="flex-1">
      <div className="h-[57px] border-b border-neutral-800 bg-neutral-900" />
      <main className="mx-auto w-full max-w-4xl animate-pulse space-y-4 px-6 py-6">
        <div className="h-6 w-40 rounded bg-neutral-900" />
        <div className="h-20 rounded-xl bg-neutral-900" />
        <div className="h-20 rounded-xl bg-neutral-900" />
        <div className="h-20 rounded-xl bg-neutral-900" />
      </main>
    </div>
  );
}
