import type { NextConfig } from "next";

function pickFirstEnv(...values: Array<string | undefined>): string | undefined {
  return values.find((value) => value != null && value.trim().length > 0);
}

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_SUPABASE_URL: pickFirstEnv(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_URL,
    ),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: pickFirstEnv(
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      process.env.SUPABASE_PUBLISHABLE_KEY,
      process.env.SUPABASE_ANON_KEY,
    ),
  },
};

export default nextConfig;
