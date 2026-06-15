import { describe, expect, it } from "vitest";
import { parseValueWithUnit, parseFormattedNumber } from "@/utils/numbers";

describe("numbers", () => {
  it("parses formatted number with comma decimal", () => {
    expect(parseFormattedNumber("27,42")).toBeCloseTo(27.42);
  });

  it("parses value with unit", () => {
    expect(parseValueWithUnit("391 km").value).toBe(391);
    expect(parseValueWithUnit("27.42 l/100 km").value).toBeCloseTo(27.42);
  });
});
