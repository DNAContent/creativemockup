import LoginForm from "./LoginForm";
import { HelixLogo } from "@/components/icons";

// Static, edge-cacheable shell — no per-request work. The proxy (src/proxy.ts)
// handles both gating (it already calls getUser on every request) and bouncing
// an already-signed-in visitor away from /login, so this page reads neither the
// session nor searchParams. The rare `?error=` is surfaced client-side in
// LoginForm. Keeping this page free of dynamic APIs lets it prerender and skip
// a serverless cold start on the most-hit public route.
export default function LoginPage() {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-6 py-16">
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <HelixLogo className="h-6 w-6 text-indigo-400" /> Helix
        </h1>
        <p className="mt-1.5 text-sm text-neutral-400">
          Sign in to build, share, and review creative with your clients.
        </p>
      </div>

      <LoginForm />
    </main>
  );
}
