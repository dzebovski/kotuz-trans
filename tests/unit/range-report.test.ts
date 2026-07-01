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
    overSpeedLimitDurationSeconds: null,
    averageSpeedKmh: 100,
    parkingCount: 1,
    parkingDurationSeconds: 600,
    maxSpeedKmh: 80,
    refillCount: 0,
    refilledL: 0,
    drainCount: 0,
    drainedL: 0,
    fuelStatus: "normal",
    routeKey: null,
    startCountryCode: null,
    endCountryCode: null,
    vehicle: {
      id: "vehicle-1",
      displayName: "Truck 1",
      tractorNumber: "AA 0001",
      wialonUnitId: 101,
      consumptionTier: 30,
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
        movementDurationSeconds: 10800,
        maxSpeedKmh: 92,
        fuelStatus: "high",
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
    expect(result.averageSpeedKmh).toBe(100);
    expect(result.maxSpeedKmh).toBe(92);
    expect(result.fuelStatus).toBe("normal");
    expect(result.highDays).toBe(1);
    expect(result.days.map((day) => day.reportDate)).toEqual([
      "2026-06-01",
      "2026-06-02",
    ]);
  });

  it("sums over-speed-limit duration across days", () => {
    const [result] = aggregateTripsByVehicle([
      trip({
        id: "day-1",
        reportDate: "2026-06-01",
        overSpeedLimitDurationSeconds: 120,
      }),
      trip({
        id: "day-2",
        reportDate: "2026-06-02",
        overSpeedLimitDurationSeconds: 300,
      }),
    ]);

    expect(result.overSpeedLimitDurationSeconds).toBe(420);
  });

  it("sums refill count and volume across days", () => {
    const [result] = aggregateTripsByVehicle([
      trip({
        id: "day-1",
        reportDate: "2026-06-01",
        refillCount: 1,
        refilledL: 120,
      }),
      trip({
        id: "day-2",
        reportDate: "2026-06-02",
        refillCount: 2,
        refilledL: 125,
      }),
    ]);

    expect(result.refillCount).toBe(3);
    expect(result.refilledL).toBe(245);
  });

  it("sums drain count and volume across days", () => {
    const [result] = aggregateTripsByVehicle([
      trip({
        id: "day-1",
        reportDate: "2026-06-01",
        drainCount: 1,
        drainedL: 30,
      }),
      trip({
        id: "day-2",
        reportDate: "2026-06-02",
        drainCount: 2,
        drainedL: 55,
      }),
    ]);

    expect(result.drainCount).toBe(3);
    expect(result.drainedL).toBe(85);
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
          consumptionTier: 30,
        },
      }),
    ]);
    expect(results).toHaveLength(2);
  });

  it("uses period fuel status from weighted average across days", () => {
    const [result] = aggregateTripsByVehicle([
      trip({
        id: "day-1",
        reportDate: "2026-06-01",
        mileageKm: 100,
        fuelConsumedL: 26,
        fuelStatus: "not_evaluated",
      }),
      trip({
        id: "day-2",
        reportDate: "2026-06-02",
        mileageKm: 100,
        fuelConsumedL: 29,
        fuelStatus: "avrg",
      }),
    ]);

    expect(result.consumptionLPer100Km).toBeCloseTo(27.5, 5);
    expect(result.fuelStatus).toBe("avrg");
  });

  it("uses period average status even when a day was high (AC2096HI scenario)", () => {
    const vehicle = {
      id: "vehicle-ac2096",
      displayName: "AC2096HI / AA5448XF",
      tractorNumber: "AC2096HI",
      wialonUnitId: 6401,
      consumptionTier: 30 as const,
    };
    const normalDayFuelL = 111.80667;
    const days = [
      trip({
        id: "day-1",
        reportDate: "2026-06-01",
        mileageKm: 400,
        fuelConsumedL: normalDayFuelL,
        fuelStatus: "avrg",
        vehicle,
      }),
      trip({
        id: "day-2",
        reportDate: "2026-06-02",
        mileageKm: 400,
        fuelConsumedL: 128,
        fuelStatus: "high",
        vehicle,
      }),
    ];
    for (let index = 2; index < 7; index += 1) {
      days.push(
        trip({
          id: `day-${index + 1}`,
          reportDate: `2026-06-0${index + 1}`,
          mileageKm: 400,
          fuelConsumedL: normalDayFuelL,
          fuelStatus: "avrg",
          vehicle,
        }),
      );
    }

    const [result] = aggregateTripsByVehicle(days);

    expect(result.consumptionLPer100Km).toBeCloseTo(28.53, 2);
    expect(result.fuelStatus).toBe("avrg");
    expect(result.highDays).toBe(1);
  });

  it("evaluates period fuel status when daily days are not_evaluated", () => {
    const [result] = aggregateTripsByVehicle([
      trip({
        id: "day-1",
        reportDate: "2026-06-01",
        mileageKm: 100,
        fuelConsumedL: 26,
        fuelStatus: "not_evaluated",
      }),
    ]);

    expect(result.consumptionLPer100Km).toBeCloseTo(26, 5);
    expect(result.fuelStatus).toBe("normal");
  });

  it("does not evaluate consumption when all days are below mileage threshold", () => {
    const [result] = aggregateTripsByVehicle([
      trip({
        id: "day-1",
        reportDate: "2026-06-24",
        mileageKm: 0.1,
        fuelConsumedL: 3,
        fuelStatus: "high",
      }),
      trip({
        id: "day-2",
        reportDate: "2026-06-25",
        mileageKm: 0.15,
        fuelConsumedL: 3.34,
        fuelStatus: "high",
      }),
    ]);

    expect(result.mileageKm).toBeCloseTo(0.25, 5);
    expect(result.fuelConsumedL).toBeCloseTo(6.34, 5);
    expect(result.consumptionLPer100Km).toBeNull();
    expect(result.fuelStatus).toBe("not_evaluated");
    expect(result.highDays).toBe(0);
  });

  it("evaluates consumption only from evaluable days in the range", () => {
    const [result] = aggregateTripsByVehicle([
      trip({
        id: "day-1",
        reportDate: "2026-06-01",
        mileageKm: 0.5,
        fuelConsumedL: 5,
        fuelStatus: "high",
      }),
      trip({
        id: "day-2",
        reportDate: "2026-06-02",
        mileageKm: 50,
        fuelConsumedL: 20,
        fuelStatus: "normal",
      }),
    ]);

    expect(result.consumptionLPer100Km).toBeCloseTo(40, 5);
    expect(result.fuelStatus).toBe("high");
    expect(result.highDays).toBe(0);
  });
});
