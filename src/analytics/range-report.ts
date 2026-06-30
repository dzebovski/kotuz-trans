import {
  evaluateFuelConsumptionStatus,
  FUEL_STATUS_RANK,
  type FuelConsumptionStatus,
  worstFuelStatus,
} from "@/analytics/fuel-consumption-status";

export type RangeDailyTrip = {
  id: string;
  reportDate: string;
  mileageKm: number;
  fuelConsumedL: number | null;
  averageFuelConsumptionLPer100Km: number | null;
  rolling1000KmConsumptionLPer100Km: number | null;
  movementDurationSeconds: number | null;
  averageSpeedKmh: number | null;
  parkingCount: number;
  parkingDurationSeconds: number | null;
  maxSpeedKmh: number | null;
  refillCount: number;
  refilledL: number;
  fuelStatus: FuelConsumptionStatus;
  routeKey: string | null;
  startCountryCode: string | null;
  endCountryCode: string | null;
  vehicle: {
    id: string;
    displayName: string;
    tractorNumber: string;
    wialonUnitId: number;
    consumptionTier: 30 | 32 | null;
  };
};

export type RangeVehicleAggregate = {
  vehicle: RangeDailyTrip["vehicle"];
  mileageKm: number;
  fuelConsumedL: number;
  consumptionLPer100Km: number | null;
  rolling1000KmConsumptionLPer100Km: number | null;
  movementDurationSeconds: number;
  averageSpeedKmh: number | null;
  parkingCount: number;
  parkingDurationSeconds: number;
  maxSpeedKmh: number | null;
  refillCount: number;
  refilledL: number;
  fuelStatus: FuelConsumptionStatus | null;
  highDays: number;
  days: RangeDailyTrip[];
};

export function aggregateTripsByVehicle(
  trips: Array<
    Omit<RangeDailyTrip, "fuelStatus"> & {
      fuelStatus?: FuelConsumptionStatus;
      anomalyStatus?: string;
    }
  >,
): RangeVehicleAggregate[] {
  const grouped = new Map<string, RangeDailyTrip[]>();
  for (const trip of trips) {
    const fuelStatus = (trip.fuelStatus ??
      trip.anomalyStatus ??
      "not_evaluated") as FuelConsumptionStatus;
    const normalizedTrip: RangeDailyTrip = {
      ...trip,
      fuelStatus,
    };
    const current = grouped.get(trip.vehicle.id) ?? [];
    current.push(normalizedTrip);
    grouped.set(trip.vehicle.id, current);
  }

  return [...grouped.values()]
    .map((unsortedDays) => {
      const days = [...unsortedDays].sort((a, b) =>
        a.reportDate.localeCompare(b.reportDate),
      );
      const mileageKm = days.reduce((sum, day) => sum + day.mileageKm, 0);
      const fuelConsumedL = days.reduce(
        (sum, day) => sum + (day.fuelConsumedL ?? 0),
        0,
      );
      const fuelDays = days.filter((day) => day.fuelConsumedL != null);
      const lastDay = days[days.length - 1];
      const movementDurationSeconds = days.reduce(
        (sum, day) => sum + (day.movementDurationSeconds ?? 0),
        0,
      );
      const consumptionLPer100Km =
        mileageKm > 0 && fuelDays.length > 0
          ? (fuelConsumedL / mileageKm) * 100
          : null;
      const periodFuelStatus =
        mileageKm > 0
          ? evaluateFuelConsumptionStatus(
              consumptionLPer100Km,
              lastDay.vehicle.consumptionTier,
            )
          : ("not_evaluated" as FuelConsumptionStatus);
      const fuelStatus = worstFuelStatus([
        ...days.map((day) => day.fuelStatus),
        periodFuelStatus,
      ]);

      return {
        vehicle: lastDay.vehicle,
        mileageKm,
        fuelConsumedL,
        consumptionLPer100Km,
        rolling1000KmConsumptionLPer100Km:
          lastDay.rolling1000KmConsumptionLPer100Km,
        movementDurationSeconds,
        averageSpeedKmh:
          movementDurationSeconds > 0
            ? mileageKm / (movementDurationSeconds / 3600)
            : null,
        parkingCount: days.reduce((sum, day) => sum + day.parkingCount, 0),
        parkingDurationSeconds: days.reduce(
          (sum, day) => sum + (day.parkingDurationSeconds ?? 0),
          0,
        ),
        refillCount: days.reduce((sum, day) => sum + day.refillCount, 0),
        refilledL: days.reduce((sum, day) => sum + day.refilledL, 0),
        maxSpeedKmh: days.reduce<number | null>(
          (maximum, day) =>
            day.maxSpeedKmh == null
              ? maximum
              : Math.max(maximum ?? 0, day.maxSpeedKmh),
          null,
        ),
        fuelStatus,
        highDays: days.filter((day) => day.fuelStatus === "high").length,
        days,
      };
    })
    .sort((a, b) =>
      a.vehicle.displayName.localeCompare(b.vehicle.displayName, "uk"),
    );
}

export { FUEL_STATUS_RANK };
