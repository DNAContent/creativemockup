import Link from "next/link";

// Shared dark app bar used across the internal (staff) pages.
export default function AppHeader({
  title,
  right,
}: {
  title: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <header className="flex items-center justify-between gap-3 border-b border-neutral-800 bg-neutral-900 px-4 py-3.5 text-white sm:px-6">
      <h1 className="min-w-0 truncate text-base font-semibold">{title}</h1>
      {right && (
        <div className="flex shrink-0 items-center gap-3 text-sm text-neutral-400">
          {right}
        </div>
      )}
    </header>
  );
}

// Shared link style for the dark header (e.g. "← Dashboard", "Team & access").
export function HeaderLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className="text-indigo-300 hover:text-white">
      {children}
    </Link>
  );
}
