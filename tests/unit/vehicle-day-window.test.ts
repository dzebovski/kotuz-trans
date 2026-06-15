import { describe, expect, it } from "vitest";
import {
  formatTimeRange,
  getVehicleDayTripWindow,
} from "@/analytics/vehicle-day-window";
import type { ParsedTripSegment } from "@/wialon/parsers/trips-report";

function segment(
  overrides: Partial<ParsedTripSegment> & { isLocalManeuver?: boolean },
): ParsedTripSegment & { isLocalManeuver: boolean } {
  return {
    sourceRowNumber: 1,
    startedAt: null,
    endedAt: null,
    durationSeconds: null,
    mileageKm: null,
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
    isLocalManeuver: false,
    ...overrides,
  };
}

describe("vehicle day trip window", () => {
  it("uses non-local segments for first and last trip times", () => {
    const window = getVehicleDayTripWindow(
      [
        segment({
          startedAt: "2026-06-14 08:00:00",
          endedAt: "2026-06-14 09:00:00",
          isLocalManeuver: true,
        }),
        segment({
          startedAt: "2026-06-14 10:15:00",
          endedAt: "2026-06-14 18:40:00",
          isLocalManeuver: false,
        }),
      ],
      "Europe/Kyiv",
    );

    expect(window.firstTripAt).toBeTruthy();
    expect(window.lastTripAt).toBeTruthy();
    expect(formatTimeRange(window.firstTripAt, window.lastTripAt, "Europe/Kyiv")).toBe(
      "10:15 — 18:40",
    );
  });

  it("falls back to all segments when only local maneuvers exist", () => {
    const window = getVehicleDayTripWindow(
      [
        segment({
          startedAt: "2026-06-14 07:05:00",
          endedAt: "2026-06-14 07:20:00",
          isLocalManeuver: true,
        }),
      ],
      "Europe/Kyiv",
    );

    expect(formatTimeRange(window.firstTripAt, window.lastTripAt, "Europe/Kyiv")).toBe(
      "07:05 — 07:20",
    );
  });
});
