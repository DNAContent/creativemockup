// Skeleton shown while a client page loads.
export default function Loading() {
  return (
    <div className="flex-1">
      <div className="h-[57px] border-b border-neutral-800 bg-neutral-900" />
      <main className="mx-auto w-full max-w-3xl animate-pulse space-y-6 px-6 py-6">
        <div className="h-56 rounded-xl bg-neutral-900" />
        <div className="h-44 rounded-xl bg-neutral-900" />
        <div className="h-44 rounded-xl bg-neutral-900" />
      </main>
    </div>
  );
}
