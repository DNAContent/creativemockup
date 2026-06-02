import { createClient } from "@supabase/supabase-js";

// Service-role Supabase client for TRUSTED SERVER-ONLY contexts (the notify
// webhook). Bypasses RLS and can read auth.users, so it must NEVER be imported
// into a client component or exposed to the browser. Guarded by env presence.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_URL");
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
