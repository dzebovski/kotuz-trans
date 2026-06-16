import { describe, expect, it } from "vitest";
import { calculateRolling1000KmConsumption } from "@/analytics/rolling-fuel";

describe("calculateRolling1000KmConsumption", () => {
  it("sums segments newest-first until ~1000 km", () => {
    const result = calculateRolling1000KmConsumption([
      { mileage_km: 120, fuel_consumed_l: 30 },
      { mileage_km: 450, fuel_consumed_l: 110 },
      { mileage_km: 500, fuel_consumed_l: 125 },
      { mileage_km: 300, fuel_consumed_l: 70 },
    ]);

    expect(result).not.toBeNull();
    expect(result!.distanceKm).toBe(1070);
    expect(result!.fuelL).toBe(265);
    expect(result!.consumptionLPer100Km).toBeCloseTo(24.766, 2);
  });

  it("returns null when any segment fuel is missing", () => {
    const result = calculateRolling1000KmConsumption([
      { mileage_km: 600, fuel_consumed_l: 150 },
      { mileage_km: 500, fuel_consumed_l: null },
    ]);
    expect(result).toBeNull();
  });

  it("returns null when total distance is below minimum", () => {
    const result = calculateRolling1000KmConsumption([
      { mileage_km: 50, fuel_consumed_l: 12 },
      { mileage_km: 40, fuel_consumed_l: 10 },
    ]);
    expect(result).toBeNull();
  });

  it("returns null for empty input", () => {
    expect(calculateRolling1000KmConsumption([])).toBeNull();
  });
});
