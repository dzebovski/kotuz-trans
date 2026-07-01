import {
  evaluateFuelConsumptionStatus,
  isConsumptionEvaluable,
} from "@/analytics/fuel-consumption-status";
import { calculateRolling1000KmConsumption } from "@/analytics/rolling-fuel";
import {
  getTripSegmentsForVehicleThrough,
  listVehicleDailyTripsAfterDate,
  updateDailyTripDerivedMetrics,
} from "@/db/trips-repository";
import { getVehicleById } from "@/db/vehicles-repository";

export async function recalculateVehicleDerivedMetricsAfterDate(input: {
  vehicleId: string;
  changedReportDate: string;
}): Promise<void> {
  const vehicle = await getVehicleById(input.vehicleId);
  const futureTrips = await listVehicleDailyTripsAfterDate(
    input.vehicleId,
    input.changedReportDate,
  );

  for (const trip of futureTrips) {
    const segments = await getTripSegmentsForVehicleThrough({
      vehicleId: input.vehicleId,
      throughEndedAt: trip.intervalEnd,
    });
    const fuelStatus =
      !isConsumptionEvaluable(trip.mileageKm)
        ? "not_evaluated"
        : evaluateFuelConsumptionStatus(
            trip.averageFuelConsumptionLPer100Km,
            vehicle?.consumption_tier ?? null,
          );
    const rolling = calculateRolling1000KmConsumption(segments);

    await updateDailyTripDerivedMetrics({
      dailyTripId: trip.id,
      baselineScope: null,
      baselineSampleSize: null,
      baselineAverageLPer100Km: null,
      baselineStddevLPer100Km: null,
      deviationPercent: null,
      anomalyStatus: fuelStatus,
      isAnomaly: fuelStatus === "high",
      rollingDistanceKm: rolling?.distanceKm ?? null,
      rollingFuelL: rolling?.fuelL ?? null,
      rollingConsumptionLPer100Km: rolling?.consumptionLPer100Km ?? null,
    });
  }
}
