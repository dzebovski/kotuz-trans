import { describe, expect, it, vi } from "vitest";
import { validateReportRange } from "@/utils/report-range";

describe("validateReportRange", () => {
  it("accepts a 90-day range", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-23T10:00:00Z"));
    const result = validateReportRange({
      from: "2026-03-26",
      to: "2026-06-23",
      timezone: "Europe/Kyiv",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.dates).toHaveLength(90);
    }
    vi.useRealTimers();
  });

  it("rejects ranges longer than 90 days and future dates", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-23T10:00:00Z"));
    expect(
      validateReportRange({
        from: "2026-03-25",
        to: "2026-06-23",
        timezone: "Europe/Kyiv",
      }),
    ).toMatchObject({ ok: false });
    expect(
      validateReportRange({
        from: "2026-06-23",
        to: "2026-06-24",
        timezone: "Europe/Kyiv",
      }),
    ).toMatchObject({ ok: false, error: "Future report dates are not allowed" });
    vi.useRealTimers();
  });
});

