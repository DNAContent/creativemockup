import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

// Next.js 16 `proxy` convention (replaces the deprecated `middleware`).
// Runs on the Node.js runtime. Refreshes the Supabase session and gates
// private routes on every matched request.
export function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Run on everything except static assets and image files.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|css|js|woff2?|ttf)$).*)",
  ],
};
