import { describe, expect, it } from "vitest";
import { isAuthPage, isProtectedPath } from "@/lib/auth/routes";

describe("auth route matching", () => {
  it("protects home, vehicles and reports API", () => {
    expect(isProtectedPath("/")).toBe(true);
    expect(isProtectedPath("/vehicles/abc-123")).toBe(true);
    expect(isProtectedPath("/api/reports/daily")).toBe(true);
    expect(isProtectedPath("/api/reports/weekly")).toBe(true);
  });

  it("does not protect public routes", () => {
    expect(isProtectedPath("/login")).toBe(false);
    expect(isProtectedPath("/api/health")).toBe(false);
    expect(isProtectedPath("/api/cron/daily-fleet-report")).toBe(false);
  });

  it("detects auth page", () => {
    expect(isAuthPage("/login")).toBe(true);
    expect(isAuthPage("/")).toBe(false);
  });
});
