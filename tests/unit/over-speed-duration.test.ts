import { describe, expect, it } from "vitest";
import {
  calculateOverSpeedDurationSeconds,
  SPEED_LIMIT_KMH,
} from "@/analytics/over-speed-duration";

describe("calculateOverSpeedDurationSeconds", () => {
  it("returns 0 for empty or single-point series", () => {
    expect(calculateOverSpeedDurationSeconds([], [])).toBe(0);
    expect(calculateOverSpeedDurationSeconds([1000], [88])).toBe(0);
  });

  it("does not count speed exactly at threshold", () => {
    expect(
      calculateOverSpeedDurationSeconds([0, 100, 200], [86, 86, 86], 86),
    ).toBe(0);
  });

  it("counts intervals where speed is strictly above threshold", () => {
    expect(
      calculateOverSpeedDurationSeconds([0, 100, 200], [0, 88, 0], 86),
    ).toBe(100);
  });

  it("skips non-positive dt (duplicate timestamps)", () => {
    expect(
      calculateOverSpeedDurationSeconds([100, 100, 200], [88, 88, 0], 86),
    ).toBe(100);
  });

  it("sums multiple over-limit segments from sample-like data", () => {
    const x = [0, 33, 66, 99, 132];
    const y = [0, 88, 88, 70, 0];
    expect(calculateOverSpeedDurationSeconds(x, y, SPEED_LIMIT_KMH)).toBe(66);
  });

  it("ignores the last point without a following interval", () => {
    expect(
      calculateOverSpeedDurationSeconds([0, 50], [88, 88], 86),
    ).toBe(50);
  });
});
