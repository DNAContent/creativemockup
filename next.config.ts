import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Tree-shake the Supabase barrels so routes that only need auth (login,
  // settings) don't pull extra machinery into first-load JS.
  experimental: {
    optimizePackageImports: ["@supabase/ssr", "@supabase/supabase-js"],
  },
};

export default nextConfig;
