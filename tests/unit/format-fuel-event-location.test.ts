import { describe, expect, it } from "vitest";
import { formatFuelEventLocation } from "@/lib/report/format";

describe("formatFuelEventLocation", () => {
  it("returns trimmed address when present", () => {
    expect(formatFuelEventLocation("  Kyiv, Ukraine  ", 50.45, 30.52)).toBe(
      "Kyiv, Ukraine",
    );
  });

  it("falls back to coordinates when address is missing", () => {
    expect(formatFuelEventLocation(null, 50.85, 3.27)).toBe(
      "50.850000° N, 3.270000° E",
    );
  });

  it("returns dash when neither address nor coordinates exist", () => {
    expect(formatFuelEventLocation(null, null, null)).toBe("—");
  });
});
