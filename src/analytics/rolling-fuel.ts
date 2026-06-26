export type RollingFuelSegment = {
  mileage_km: number;
  fuel_consumed_l: number | null;
};

export type Rolling1000KmResult = {
  distanceKm: number;
  fuelL: number;
  consumptionLPer100Km: number;
};

const TARGET_DISTANCE_KM = 1000;
const MIN_DISTANCE_KM = 100;

export function calculateRolling1000KmConsumption(
  segmentsNewestFirst: RollingFuelSegment[],
): Rolling1000KmResult | null {
  if (segmentsNewestFirst.length === 0) {
    return null;
  }

  let distanceKm = 0;
  let fuelL = 0;

  for (const segment of segmentsNewestFirst) {
    if (segment.fuel_consumed_l == null) {
      continue;
    }
    distanceKm += segment.mileage_km;
    fuelL += segment.fuel_consumed_l;
    if (distanceKm >= TARGET_DISTANCE_KM) {
      break;
    }
  }

  if (distanceKm < MIN_DISTANCE_KM || fuelL <= 0) {
    return null;
  }

  return {
    distanceKm,
    fuelL,
    consumptionLPer100Km: (fuelL / distanceKm) * 100,
  };
}
