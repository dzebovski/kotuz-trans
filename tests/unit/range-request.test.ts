import { describe, expect, it } from "vitest";
import {
  shouldApplyRangeResponse,
  toRangeKey,
} from "@/lib/report/range-request";

describe("range-request helpers", () => {
  it("builds a stable range key", () => {
    expect(toRangeKey("2026-06-22", "2026-06-28")).toBe(
      "2026-06-22:2026-06-28",
    );
  });

  it("accepts responses for the active range", () => {
    expect(
      shouldApplyRangeResponse(
        "2026-06-29",
        "2026-06-29",
        "2026-06-29",
        "2026-06-29",
      ),
    ).toBe(true);
  });

  it("rejects stale responses after the range changes", () => {
    expect(
      shouldApplyRangeResponse(
        "2026-06-22",
        "2026-06-28",
        "2026-06-29",
        "2026-06-29",
      ),
    ).toBe(false);
  });

  it("rejects responses when only one bound changed", () => {
    expect(
      shouldApplyRangeResponse(
        "2026-06-22",
        "2026-06-28",
        "2026-06-22",
        "2026-06-28",
      ),
    ).toBe(true);
    expect(
      shouldApplyRangeResponse(
        "2026-06-22",
        "2026-06-28",
        "2026-06-22",
        "2026-06-27",
      ),
    ).toBe(false);
  });
});
