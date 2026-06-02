// A template re-mounts on every navigation, so this gives each route a subtle
// fade-up entrance. flex-col + flex-1 preserve the pages' fill-height layouts.
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-0 w-full flex-1 flex-col animate-fade-up">
      {children}
    </div>
  );
}
