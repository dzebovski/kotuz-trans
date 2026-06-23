export type RangeDailyTrip = {
  id: string;
  reportDate: string;
  mileageKm: number;
  fuelConsumedL: number | null;
  averageFuelConsumptionLPer100Km: number | null;
  rolling1000KmConsumptionLPer100Km: number | null;
  movementDurationSeconds: number | null;
  parkingCount: number;
  parkingDurationSeconds: number | null;
  maxSpeedKmh: number | null;
  anomalyStatus: string;
  routeKey: string | null;
  vehicle: {
    id: string;
    displayName: string;
    tractorNumber: string;
    wialonUnitId: number;
  };
};

export type RangeVehicleAggregate = {
  vehicle: RangeDailyTrip["vehicle"];
  mileageKm: number;
  fuelConsumedL: number;
  consumptionLPer100Km: number | null;
  rolling1000KmConsumptionLPer100Km: number | null;
  movementDurationSeconds: number;
  parkingCount: number;
  parkingDurationSeconds: number;
  maxSpeedKmh: number | null;
  anomalyStatus: string;
  anomalyDays: number;
  days: RangeDailyTrip[];
};

const ANOMALY_RANK: Record<string, number> = {
  not_evaluated: 0,
  insufficient_history: 1,
  normal: 2,
  warning: 3,
  critical: 4,
};

export function aggregateTripsByVehicle(
  trips: RangeDailyTrip[],
): RangeVehicleAggregate[] {
  const grouped = new Map<string, RangeDailyTrip[]>();
  for (const trip of trips) {
    const current = grouped.get(trip.vehicle.id) ?? [];
    current.push(trip);
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
      const anomalyStatus = days.reduce(
        (worst, day) =>
          (ANOMALY_RANK[day.anomalyStatus] ?? 0) >
          (ANOMALY_RANK[worst] ?? 0)
            ? day.anomalyStatus
            : worst,
        "not_evaluated",
      );

      return {
        vehicle: lastDay.vehicle,
        mileageKm,
        fuelConsumedL,
        consumptionLPer100Km:
          mileageKm > 0 && fuelDays.length > 0
            ? (fuelConsumedL / mileageKm) * 100
            : null,
        rolling1000KmConsumptionLPer100Km:
          lastDay.rolling1000KmConsumptionLPer100Km,
        movementDurationSeconds: days.reduce(
          (sum, day) => sum + (day.movementDurationSeconds ?? 0),
          0,
        ),
        parkingCount: days.reduce((sum, day) => sum + day.parkingCount, 0),
        parkingDurationSeconds: days.reduce(
          (sum, day) => sum + (day.parkingDurationSeconds ?? 0),
          0,
        ),
        maxSpeedKmh: days.reduce<number | null>(
          (maximum, day) =>
            day.maxSpeedKmh == null
              ? maximum
              : Math.max(maximum ?? 0, day.maxSpeedKmh),
          null,
        ),
        anomalyStatus,
        anomalyDays: days.filter(
          (day) =>
            day.anomalyStatus === "warning" ||
            day.anomalyStatus === "critical",
        ).length,
        days,
      };
    })
    .sort((a, b) =>
      a.vehicle.displayName.localeCompare(b.vehicle.displayName, "uk"),
    );
}

