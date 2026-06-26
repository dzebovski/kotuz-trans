import { describe, expect, it } from "vitest";
import {
  buildPeriodRouteCountries,
  countryCodeToFlag,
  formatRouteFlags,
  parseRouteKeyCountries,
} from "@/utils/route-flags";

describe("countryCodeToFlag", () => {
  it("renders UA and GB flags", () => {
    expect(countryCodeToFlag("UA")).toBe("🇺🇦");
    expect(countryCodeToFlag("GB")).toBe("🇬🇧");
  });

  it("normalizes UK alias to GB flag", () => {
    expect(countryCodeToFlag("UK")).toBe("🇬🇧");
  });
});

describe("parseRouteKeyCountries", () => {
  it("extracts start and end country codes", () => {
    expect(parseRouteKeyCountries("UA:НІКОПОЛЬ>PL:WARSZAWA")).toEqual({
      start: "UA",
      end: "PL",
    });
    expect(parseRouteKeyCountries("GB:CANTERBURY>BE:NIVELLES")).toEqual({
      start: "GB",
      end: "BE",
    });
  });
});

describe("buildPeriodRouteCountries", () => {
  it("chains countries across days without consecutive duplicates", () => {
    const countries = buildPeriodRouteCountries([
      {
        reportDate: "2026-06-01",
        mileageKm: 200,
        routeKey: "UA:KYIV>PL:WARSZAWA",
      },
      {
        reportDate: "2026-06-02",
        mileageKm: 300,
        routeKey: "PL:WARSZAWA>DE:BERLIN",
      },
    ]);
    expect(countries).toEqual(["UA", "PL", "DE"]);
  });
});

describe("formatRouteFlags", () => {
  it("formats flag sequence for period", () => {
    expect(
      formatRouteFlags([
        {
          reportDate: "2026-06-01",
          mileageKm: 100,
          routeKey: "UA:KYIV>PL:WARSZAWA",
        },
        {
          reportDate: "2026-06-02",
          mileageKm: 200,
          routeKey: "PL:WARSZAWA>DE:BERLIN",
        },
      ]),
    ).toBe("🇺🇦 → 🇵🇱 → 🇩🇪");
  });

  it("returns dash when no movement", () => {
    expect(
      formatRouteFlags([
        {
          reportDate: "2026-06-01",
          mileageKm: 0,
          routeKey: "UA:KYIV>PL:WARSZAWA",
        },
      ]),
    ).toBe("—");
  });
});
