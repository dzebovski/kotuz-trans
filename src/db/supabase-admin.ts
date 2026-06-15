import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getServerEnv } from "@/config/env";

let client: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (client) {
    return client;
  }
  const env = getServerEnv();
  client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  return client;
}

export function resetSupabaseClientForTests(): void {
  client = null;
}
