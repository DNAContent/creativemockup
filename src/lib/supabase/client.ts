import { createBrowserClient } from "@supabase/ssr";

// Browser Supabase client for Client Components (the review portal, copy-link
// buttons, etc.). The review portal uses the anon key to call token RPCs.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
