import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { EmailOtpType } from "@supabase/supabase-js";

// Magic-link / OTP landing. Supabase appends either a PKCE `code` or a
// `token_hash`+`type` to the emailRedirectTo URL. We complete the session here
// and bounce to `next` (the set the client was trying to reach).
// Only allow same-site, single-leading-slash paths as redirect targets, so a
// crafted ?next=//evil.com (or /\evil) magic link can't bounce a freshly
// authenticated user off-site.
function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) {
    return "/";
  }
  return raw;
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = safeNext(searchParams.get("next"));

  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }

  // Preserve where the user was headed so the error page can offer a retry.
  const errorUrl = new URL(`${origin}/auth/auth-error`);
  errorUrl.searchParams.set("next", next);
  return NextResponse.redirect(errorUrl);
}
