import { describe, expect, it } from "vitest";
import type { VehicleTripSegment } from "@/lib/report/types";
import { buildVehicleSegmentsSummary } from "@/lib/report/vehicle-segments-summary";

function segment(
  overrides: Partial<VehicleTripSegment> & Pick<VehicleTripSegment, "id">,
): VehicleTripSegment {
  return {
    dailyTripId: "trip-1",
    reportDate: "2026-06-22",
    startedAt: "2026-06-22T08:00:00Z",
    endedAt: "2026-06-22T09:00:00Z",
    durationSeconds: 3600,
    mileageKm: 80,
    fuelConsumedL: 20,
    averageFuelConsumptionLPer100Km: 25,
    averageSpeedKmh: 80,
    maxSpeedKmh: 92,
    startLatitude: null,
    startLongitude: null,
    startAddress: "Kyiv",
    endLatitude: null,
    endLongitude: null,
    endAddress: "Zhytomyr",
    isLocalManeuver: false,
    ...overrides,
  };
}

describe("buildVehicleSegmentsSummary", () => {
  it("returns null for an empty segment list", () => {
    expect(buildVehicleSegmentsSummary([])).toBeNull();
  });

  it("uses chronological endpoints for unsorted segments and counts movement days", () => {
    const summary = buildVehicleSegmentsSummary([
      segment({
        id: "last",
        reportDate: "2026-06-24",
        startedAt: "2026-06-24T18:00:00Z",
        endedAt: "2026-06-24T19:30:00Z",
        startAddress: "Lviv",
        endAddress: "Uzhhorod",
      }),
      segment({
        id: "first",
        reportDate: "2026-06-22",
        startedAt: "2026-06-22T06:00:00Z",
        endedAt: "2026-06-22T07:00:00Z",
        startAddress: "Kyiv",
        endAddress: "Rivne",
      }),
      segment({
        id: "middle",
        reportDate: "2026-06-22",
        startedAt: "2026-06-22T12:00:00Z",
        endedAt: "2026-06-22T13:00:00Z",
        startAddress: "Rivne",
        endAddress: "Lviv",
      }),
    ]);

    expect(summary).toEqual({
      segmentCount: 3,
      movementDayCount: 2,
      firstStartedAt: "2026-06-22T06:00:00Z",
      lastEndedAt: "2026-06-24T19:30:00Z",
      startAddress: "Kyiv",
      endAddress: "Uzhhorod",
    });
  });
});
