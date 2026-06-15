import { describe, expect, it } from "vitest";
import { DateTime } from "luxon";
import { getBusinessDayInterval, getPreviousBusinessDay } from "@/utils/time";

describe("time", () => {
  it("builds Kyiv previous-day interval", () => {
    const reference = DateTime.fromISO("2026-06-15T10:00:00", {
      zone: "Europe/Kyiv",
    });
    if (!reference.isValid) {
      throw new Error("Invalid reference date");
    }
    const reportDate = getPreviousBusinessDay("Europe/Kyiv", reference);
    expect(reportDate).toBe("2026-06-14");
    const interval = getBusinessDayInterval(reportDate, "Europe/Kyiv");
    expect(interval.fromUnix).toBeLessThan(interval.toUnix);
  });

  it("handles DST spring forward boundary", () => {
    const interval = getBusinessDayInterval("2026-03-29", "Europe/Kyiv");
    const hours =
      (interval.intervalEnd.getTime() - interval.intervalStart.getTime()) /
      (1000 * 60 * 60);
    expect(hours).toBeGreaterThan(22);
    expect(hours).toBeLessThan(26);
  });
});
