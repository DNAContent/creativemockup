import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Public routes that do NOT require an agency login. /c is the client review
// portal (gated by its own magic-link allowlist). /auth handles magic-link
// callbacks. /login is the staff auth page. /api routes authenticate
// themselves (e.g. the notify webhook checks a shared secret) and must NEVER be
// redirected to /login — an unauthenticated POST from the DB would otherwise be
// bounced as a 307 and never run.
const PUBLIC_PREFIXES = ["/login", "/c", "/auth", "/api"];

// Refreshes the Supabase auth session on every request and gates private
// routes. Returns the response with refreshed cookies attached. Called from
// the Next 16 `proxy` convention (src/proxy.ts).
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANT: getUser() must be called to refresh the token. Do not run code
  // between createServerClient and getUser, or sessions will randomly drop.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  // Match whole path segments so "/c" doesn't also match "/clients".
  const isPublic = PUBLIC_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return response;
}
