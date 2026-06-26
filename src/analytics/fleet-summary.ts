export type FleetVehicleSummary = {
  displayName: string;
  tractorNumber: string;
  mileageKm: number;
  fuelConsumedL: number | null;
  averageFuelConsumptionLPer100Km: number | null;
  deviationPercent: number | null;
  baselineAverageLPer100Km: number | null;
  anomalyStatus: string;
  routeKey: string | null;
  highwayRatio: number | null;
  firstTripAt: string | null;
  lastTripAt: string | null;
  refillCount?: number;
  refilledL?: number;
  drainCount?: number;
  error?: string;
};

export type FleetSummary = {
  reportDate: string;
  processed: number;
  expected: number;
  totalMileageKm: number;
  totalFuelConsumedL: number;
  averageConsumptionLPer100Km: number | null;
  refillCount: number;
  refilledL: number;
  drainCount: number;
  failedVehicles: Array<{ wialonUnitId: number; reason: string }>;
  vehicles: FleetVehicleSummary[];
};

export function buildFleetSummary(input: {
  reportDate: string;
  expected: number;
  vehicles: FleetVehicleSummary[];
  failedVehicles: Array<{ wialonUnitId: number; reason: string }>;
}): FleetSummary {
  const successful = input.vehicles;
  const totalMileageKm = successful.reduce(
    (sum, vehicle) => sum + vehicle.mileageKm,
    0,
  );
  const totalFuelConsumedL = successful.reduce(
    (sum, vehicle) => sum + (vehicle.fuelConsumedL ?? 0),
    0,
  );
  const refillCount = successful.reduce(
    (sum, vehicle) => sum + (vehicle.refillCount ?? 0),
    0,
  );
  const refilledL = successful.reduce(
    (sum, vehicle) => sum + (vehicle.refilledL ?? 0),
    0,
  );
  const drainCount = successful.reduce(
    (sum, vehicle) => sum + (vehicle.drainCount ?? 0),
    0,
  );

  const consumptionValues = successful
    .map((vehicle) => vehicle.averageFuelConsumptionLPer100Km)
    .filter((value): value is number => value != null);
  const averageConsumptionLPer100Km =
    consumptionValues.length > 0
      ? consumptionValues.reduce((sum, value) => sum + value, 0) /
        consumptionValues.length
      : null;

  return {
    reportDate: input.reportDate,
    processed: successful.length,
    expected: input.expected,
    totalMileageKm,
    totalFuelConsumedL,
    averageConsumptionLPer100Km,
    refillCount,
    refilledL,
    drainCount,
    failedVehicles: input.failedVehicles,
    vehicles: successful,
  };
}

export function topEfficientVehicles(
  vehicles: FleetVehicleSummary[],
  limit = 5,
): FleetVehicleSummary[] {
  return [...vehicles]
    .filter(
      (vehicle) =>
        vehicle.mileageKm >= 50 &&
        vehicle.averageFuelConsumptionLPer100Km != null,
    )
    .sort(
      (a, b) =>
        (a.averageFuelConsumptionLPer100Km ?? Number.POSITIVE_INFINITY) -
        (b.averageFuelConsumptionLPer100Km ?? Number.POSITIVE_INFINITY),
    )
    .slice(0, limit);
}

export function highFuelAlerts(
  vehicles: FleetVehicleSummary[],
): FleetVehicleSummary[] {
  return vehicles.filter((vehicle) => vehicle.anomalyStatus === "high");
}
