import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

// Next.js 16 `proxy` convention (replaces the deprecated `middleware`).
// Runs on the Node.js runtime. Refreshes the Supabase session and gates
// private routes on every matched request.
export function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Run on everything except static assets, image files, and /api. API routes
  // authenticate themselves (the notify webhook checks a shared secret) and are
  // never gated, so refreshing the Supabase session for them only adds a wasted
  // getUser() round-trip to every webhook hit.
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|css|js|woff2?|ttf)$).*)",
  ],
};
