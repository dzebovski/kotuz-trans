import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { classifyRoute } from "@/analytics/route-classifier";
import { parseFuelReport } from "@/wialon/parsers/fuel-report";
import { parseTripsReport, type ParsedTripSegment } from "@/wialon/parsers/trips-report";

const fixturesDir = path.join(process.cwd(), "tests/fixtures");

function baseSegment(
  overrides: Partial<ParsedTripSegment>,
): ParsedTripSegment {
  return {
    sourceRowNumber: 1,
    startedAt: null,
    endedAt: null,
    durationSeconds: null,
    mileageKm: 100,
    urbanMileageKm: null,
    highwayMileageKm: null,
    averageFuelConsumptionLPer100Km: null,
    fuelConsumedL: null,
    averageSpeedKmh: null,
    maxSpeedKmh: null,
    startingFuelL: null,
    endingFuelL: null,
    startLatitude: null,
    startLongitude: null,
    startCountry: null,
    startCity: null,
    startAddress: null,
    endLatitude: null,
    endLongitude: null,
    endCountry: null,
    endCity: null,
    endAddress: null,
    rawRow: {},
    ...overrides,
  };
}

describe("parsers and route classification", () => {
  it("parses fuel stats by label for unit 6221", () => {
    const fixture = JSON.parse(
      readFileSync(
        path.join(fixturesDir, "fuel-report-6221-2026-06-14.json"),
        "utf8",
      ),
    );
    const parsed = parseFuelReport(fixture);
    expect(parsed.daily.mileageKm).toBe(391);
    expect(parsed.daily.fuelConsumedL).toBe(107);
    expect(parsed.daily.averageFuelConsumptionLPer100Km).toBeCloseTo(27.42);
  });

  it("parses 17-column unit_trips rows", () => {
    const fixture = JSON.parse(
      readFileSync(
        path.join(fixturesDir, "trips-report-6221-2026-06-14.json"),
        "utf8",
      ),
    );
    const segments = parseTripsReport(fixture.rows);
    expect(segments).toHaveLength(2);
    expect(segments[0].mileageKm).toBe(231);
    expect(segments[1].mileageKm).toBe(161);
  });

  it("classifies De Lutte to Oostende route", () => {
    const fixture = JSON.parse(
      readFileSync(
        path.join(fixturesDir, "trips-report-6221-2026-06-14.json"),
        "utf8",
      ),
    );
    const route = classifyRoute(parseTripsReport(fixture.rows), 2);
    expect(route.routeKey).toBe("NL:DE_LUTTE>BE:OOSTENDE");
    expect(route.routeTag).toBe("EU_INTERNATIONAL");
  });

  it("classifies Canterbury to Nivelles route with local maneuvers", () => {
    const fixture = JSON.parse(
      readFileSync(
        path.join(fixturesDir, "trips-report-3764-2026-06-11.json"),
        "utf8",
      ),
    );
    const route = classifyRoute(parseTripsReport(fixture.rows), 2);
    expect(route.routeKey).toBe("GB:CANTERBURY>BE:NIVELLES");
    expect(route.routeTag).toBe("UK_EU_INTERNATIONAL");
    expect(route.segments.filter((segment) => segment.isLocalManeuver)).toHaveLength(2);
  });

  it("classifies Ukrainian domestic route with km-from postal suffix", () => {
    const route = classifyRoute(
      [
        baseSegment({
          startAddress:
            "Україна, Пирятинська ТГ, Лубенський р-н, Полтавська обл., М-03, 0.35 km from 37044",
          endAddress:
            "Україна, Яворівська ТГ, Яворівський р-н, Львівська обл., М-10, 1.05 km from Глиниці 81035",
        }),
      ],
      2,
    );
    expect(route.routeKey).toBe("UA:ПИРЯТИНСЬКА_ТГ>UA:ГЛИНИЦІ");
    expect(route.routeTag).toBe("UA_INTERNAL");
    expect(route.startCountryCode).toBe("UA");
    expect(route.endCountryCode).toBe("UA");
  });
});
