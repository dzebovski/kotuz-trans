import { describe, expect, it } from "vitest";
import {
  aggregateTripsByVehicle,
  type RangeDailyTrip,
} from "@/analytics/range-report";

function trip(
  overrides: Partial<RangeDailyTrip> & Pick<RangeDailyTrip, "id" | "reportDate">,
): RangeDailyTrip {
  return {
    mileageKm: 100,
    fuelConsumedL: 20,
    averageFuelConsumptionLPer100Km: 20,
    rolling1000KmConsumptionLPer100Km: 22,
    movementDurationSeconds: 3600,
    parkingCount: 1,
    parkingDurationSeconds: 600,
    maxSpeedKmh: 80,
    anomalyStatus: "normal",
    routeKey: null,
    vehicle: {
      id: "vehicle-1",
      displayName: "Truck 1",
      tractorNumber: "AA 0001",
      wialonUnitId: 101,
    },
    ...overrides,
  };
}

describe("aggregateTripsByVehicle", () => {
  it("uses weighted fuel consumption and the last day's rolling value", () => {
    const [result] = aggregateTripsByVehicle([
      trip({
        id: "day-2",
        reportDate: "2026-06-02",
        mileageKm: 300,
        fuelConsumedL: 90,
        rolling1000KmConsumptionLPer100Km: 27,
        maxSpeedKmh: 92,
        anomalyStatus: "warning",
      }),
      trip({
        id: "day-1",
        reportDate: "2026-06-01",
        mileageKm: 100,
        fuelConsumedL: 10,
        rolling1000KmConsumptionLPer100Km: 18,
      }),
    ]);

    expect(result.mileageKm).toBe(400);
    expect(result.fuelConsumedL).toBe(100);
    expect(result.consumptionLPer100Km).toBe(25);
    expect(result.rolling1000KmConsumptionLPer100Km).toBe(27);
    expect(result.maxSpeedKmh).toBe(92);
    expect(result.anomalyStatus).toBe("warning");
    expect(result.anomalyDays).toBe(1);
    expect(result.days.map((day) => day.reportDate)).toEqual([
      "2026-06-01",
      "2026-06-02",
    ]);
  });

  it("groups different vehicles independently", () => {
    const results = aggregateTripsByVehicle([
      trip({ id: "one", reportDate: "2026-06-01" }),
      trip({
        id: "two",
        reportDate: "2026-06-01",
        vehicle: {
          id: "vehicle-2",
          displayName: "Truck 2",
          tractorNumber: "AA 0002",
          wialonUnitId: 102,
        },
      }),
    ]);
    expect(results).toHaveLength(2);
  });
});

