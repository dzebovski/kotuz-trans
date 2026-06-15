import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseFuelReport } from "@/wialon/parsers/fuel-report";
import { parseTripsReport } from "@/wialon/parsers/trips-report";
import { classifyRoute } from "@/analytics/route-classifier";

const fixturesDir = path.join(process.cwd(), "tests/fixtures");

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
});
