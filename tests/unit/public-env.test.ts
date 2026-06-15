import { afterEach, describe, expect, it, vi } from "vitest";

describe("getPublicEnv fallbacks", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("uses SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY when NEXT_PUBLIC vars are missing", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "publishable-key");

    const { getPublicEnv } = await import("@/config/env");
    const env = getPublicEnv();

    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBe("https://example.supabase.co");
    expect(env.NEXT_PUBLIC_SUPABASE_ANON_KEY).toBe("publishable-key");
  });
});
