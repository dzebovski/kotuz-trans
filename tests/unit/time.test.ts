import { describe, expect, it } from "vitest";
import { DateTime } from "luxon";
import {
  enumerateReportDates,
  getBusinessDayInterval,
  getPreviousBusinessDay,
  getRollingReportDateRange,
} from "@/utils/time";

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

  it("enumerates inclusive report dates", () => {
    expect(enumerateReportDates("2026-06-14", "2026-06-15")).toEqual([
      "2026-06-14",
      "2026-06-15",
    ]);
    expect(enumerateReportDates("2026-06-14", "2026-06-14")).toEqual([
      "2026-06-14",
    ]);
  });

  it("rejects invalid report date ranges", () => {
    expect(() => enumerateReportDates("2026-06-15", "2026-06-14")).toThrow(
      /after/,
    );
  });

  it("builds rolling 30-day range ending yesterday in Kyiv", () => {
    const reference = DateTime.fromISO("2026-06-16T10:00:00", {
      zone: "Europe/Kyiv",
    });
    if (!reference.isValid) {
      throw new Error("Invalid reference date");
    }
    const range = getRollingReportDateRange(30, "Europe/Kyiv", reference);
    expect(range.to).toBe("2026-06-15");
    expect(range.from).toBe("2026-05-17");
    expect(enumerateReportDates(range.from, range.to)).toHaveLength(30);
  });
});
