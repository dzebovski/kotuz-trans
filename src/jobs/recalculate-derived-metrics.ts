import { calculateDynamicBaseline } from "@/analytics/baseline";
import { evaluateFuelAnomaly } from "@/analytics/anomaly";
import { calculateRolling1000KmConsumption } from "@/analytics/rolling-fuel";
import { getServerEnv } from "@/config/env";
import {
  getBaselineHistory,
  getTripSegmentsForVehicleThrough,
  listVehicleDailyTripsAfterDate,
  updateDailyTripDerivedMetrics,
} from "@/db/trips-repository";

export async function recalculateVehicleDerivedMetricsAfterDate(input: {
  vehicleId: string;
  changedReportDate: string;
}): Promise<void> {
  const env = getServerEnv();
  const futureTrips = await listVehicleDailyTripsAfterDate(
    input.vehicleId,
    input.changedReportDate,
  );

  for (const trip of futureTrips) {
    const [history, segments] = await Promise.all([
      getBaselineHistory(
        input.vehicleId,
        trip.reportDate,
        env.BASELINE_LOOKBACK_DAYS,
      ),
      getTripSegmentsForVehicleThrough({
        vehicleId: input.vehicleId,
        throughEndedAt: trip.intervalEnd,
      }),
    ]);
    const baseline = calculateDynamicBaseline({
      history,
      reportDate: trip.reportDate,
      routeKey: trip.routeKey,
      routeTag: trip.routeTag,
      highwayRatio: trip.highwayRatio,
      config: {
        lookbackDays: env.BASELINE_LOOKBACK_DAYS,
        minSamples: env.BASELINE_MIN_SAMPLES,
        highwayTolerance: env.BASELINE_HIGHWAY_TOLERANCE,
      },
    });
    const anomaly = evaluateFuelAnomaly({
      actualConsumption: trip.averageFuelConsumptionLPer100Km,
      baseline,
      thresholds: {
        warningPercent: env.ANOMALY_WARNING_PERCENT,
        criticalPercent: env.ANOMALY_CRITICAL_PERCENT,
      },
    });
    const rolling = calculateRolling1000KmConsumption(segments);

    await updateDailyTripDerivedMetrics({
      dailyTripId: trip.id,
      baselineScope: anomaly.baselineScope,
      baselineSampleSize: anomaly.baselineSampleSize,
      baselineAverageLPer100Km: anomaly.baselineAverageLPer100Km,
      baselineStddevLPer100Km: anomaly.baselineStddevLPer100Km,
      deviationPercent: anomaly.deviationPercent,
      anomalyStatus: anomaly.anomalyStatus,
      isAnomaly: anomaly.isAnomaly,
      rollingDistanceKm: rolling?.distanceKm ?? null,
      rollingFuelL: rolling?.fuelL ?? null,
      rollingConsumptionLPer100Km: rolling?.consumptionLPer100Km ?? null,
    });
  }
}
