import { DateTime } from "luxon";
import { evaluateFuelConsumptionStatus } from "@/analytics/fuel-consumption-status";
import { calculateRolling1000KmConsumption } from "@/analytics/rolling-fuel";
import { normalizeCountryCode } from "@/analytics/country-normalizer";
import { classifyRoute } from "@/analytics/route-classifier";
import { sanitizeTripSegmentsForGpsSpoofing } from "@/analytics/gps-spoofing";
import { getVehicleDayTripWindow } from "@/analytics/vehicle-day-window";
import { getServerEnv } from "@/config/env";
import {
  getRecentTripSegmentsForVehicle,
  upsertDailyTripWithSegments,
  type DailyTripUpsert,
  type FuelEventUpsert,
  type TripSegmentUpsert,
} from "@/db/trips-repository";
import type { VehicleRecord } from "@/db/vehicles-repository";
import { log } from "@/utils/logger";
import { isWithinPercentTolerance } from "@/utils/numbers";
import type { BusinessDayInterval } from "@/utils/time";
import { WialonClient } from "@/wialon/client";
import { parseFuelEvents } from "@/wialon/parsers/fuel-events";
import {
  parseFuelReport,
  resolveFuelEventTableIndices,
  shouldLoadFuelChronology,
} from "@/wialon/parsers/fuel-report";
import { parseTripsDailyStats, parseTripsReport } from "@/wialon/parsers/trips-report";
import { runWialonReport } from "@/wialon/report-runner";
import { WialonError } from "@/wialon/errors";

export type ProcessVehicleResult = {
  success: boolean;
  vehicle: VehicleRecord;
  summary?: {
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
    refillCount: number;
    refilledL: number;
    drainCount: number;
  };
  error?: string;
  warnings: string[];
};

function toIsoTimestamp(
  value: string | null,
  timezone: string,
  reportDate: string,
): string {
  if (!value) {
    return DateTime.fromISO(reportDate, { zone: timezone })
      .startOf("day")
      .toUTC()
      .toISO()!;
  }
  const parsed = DateTime.fromFormat(value, "yyyy-MM-dd HH:mm:ss", {
    zone: timezone,
  });
  if (parsed.isValid) {
    return parsed.toUTC().toISO()!;
  }
  const iso = DateTime.fromISO(value, { zone: timezone });
  if (iso.isValid) {
    return iso.toUTC().toISO()!;
  }
  return DateTime.fromISO(reportDate, { zone: timezone })
    .startOf("day")
    .toUTC()
    .toISO()!;
}

function num(value: number | null | undefined, fallback = 0): number {
  return value == null || Number.isNaN(value) ? fallback : value;
}

export async function processVehicle(input: {
  vehicle: VehicleRecord;
  ingestionRunId: string;
  interval: BusinessDayInterval;
  timezone: string;
}): Promise<ProcessVehicleResult> {
  const env = getServerEnv();
  const warnings: string[] = [];
  const client = new WialonClient();
  const startedAt = Date.now();

  try {
    await client.login();

    const reportInterval = {
      flags: 0,
      from: input.interval.fromUnix,
      to: input.interval.toUnix,
    };

    const fuelResult = await runWialonReport(
      {
        reportResourceId: env.WIALON_REPORT_RESOURCE_ID,
        reportTemplateId: env.WIALON_FUEL_REPORT_TEMPLATE_ID,
        reportObjectId: input.vehicle.wialon_unit_id,
        reportObjectSecId: 0,
        interval: reportInterval,
        remoteExec: 1,
      },
      {
        client,
        loadRows: true,
        resolveTableIndices: ({ stats, tables }) =>
          resolveFuelEventTableIndices({ stats, tables: tables ?? [] }),
      },
    );

    const fuelParsed = parseFuelReport({
      stats: fuelResult.stats,
      rows: fuelResult.rows,
    });
    if (!shouldLoadFuelChronology(fuelParsed.daily)) {
      fuelParsed.chronologyRows = [];
    }

    const tripsResult = await runWialonReport(
      {
        reportResourceId: env.WIALON_REPORT_RESOURCE_ID,
        reportTemplateId: env.WIALON_TRIPS_REPORT_TEMPLATE_ID,
        reportObjectId: input.vehicle.wialon_unit_id,
        reportObjectSecId: 0,
        interval: reportInterval,
        remoteExec: 1,
      },
      { client },
    );

    const parsedTrips = parseTripsReport(tripsResult.rows);
    const tripsDailyStats = parseTripsDailyStats(tripsResult.stats);
    warnings.push(...tripsDailyStats.warnings);
    const { segments: tripSegments, warnings: spoofWarnings } =
      sanitizeTripSegmentsForGpsSpoofing(parsedTrips);
    warnings.push(...spoofWarnings);
    const route = classifyRoute(tripSegments, env.LOCAL_MANEUVER_MAX_KM);
    const tripWindow = getVehicleDayTripWindow(route.segments, input.timezone);
    warnings.push(...fuelParsed.daily.warnings);

    const fuelMileage = fuelParsed.daily.mileageKm;
    const tripsMileage = tripSegments.reduce(
      (sum, segment) => sum + num(segment.mileageKm),
      0,
    );
    let dataQualityBlocked = false;
    if (
      fuelMileage != null &&
      tripsMileage > 0 &&
      !isWithinPercentTolerance(tripsMileage, fuelMileage, 5)
    ) {
      warnings.push(
        `Fuel/trips mileage mismatch: fuel=${fuelMileage}, trips=${tripsMileage}`,
      );
      dataQualityBlocked = true;
    } else if (fuelMileage != null && tripsMileage > 0) {
      const diff = Math.abs(((tripsMileage - fuelMileage) / fuelMileage) * 100);
      if (diff > 0 && diff <= 5) {
        warnings.push("Fuel/trips mileage differs within rounding tolerance");
      }
    }

    const mileageKm = num(fuelParsed.daily.mileageKm, tripsMileage);
    const urbanMileageKm = num(fuelParsed.daily.urbanMileageKm);
    const highwayMileageKm = num(fuelParsed.daily.highwayMileageKm);
    const highwayRatio =
      mileageKm > 0 ? Math.min(1, Math.max(0, highwayMileageKm / mileageKm)) : null;

    const fuelStatus = dataQualityBlocked
      ? "not_evaluated"
      : evaluateFuelConsumptionStatus(
          fuelParsed.daily.averageFuelConsumptionLPer100Km,
          input.vehicle.consumption_tier,
        );

    const fuelEventsParsed = parseFuelEvents(fuelParsed.chronologyRows);
    warnings.push(...fuelEventsParsed.warnings);

    const segments: TripSegmentUpsert[] = route.segments.map((segment) => ({
      source_table_index: 0,
      source_row_number: segment.sourceRowNumber,
      segment_type: "trip",
      started_at: toIsoTimestamp(
        segment.startedAt,
        input.timezone,
        input.interval.reportDate,
      ),
      ended_at: toIsoTimestamp(
        segment.endedAt,
        input.timezone,
        input.interval.reportDate,
      ),
      duration_seconds: segment.durationSeconds,
      mileage_km: num(segment.mileageKm),
      is_local_maneuver: segment.isLocalManeuver,
      start_latitude: segment.startLatitude,
      start_longitude: segment.startLongitude,
      start_country_code: normalizeCountryCode(segment.startCountry),
      start_city: segment.startCity,
      start_address: segment.startAddress,
      end_latitude: segment.endLatitude,
      end_longitude: segment.endLongitude,
      end_country_code: normalizeCountryCode(segment.endCountry),
      end_city: segment.endCity,
      end_address: segment.endAddress,
      urban_mileage_km: segment.urbanMileageKm,
      highway_mileage_km: segment.highwayMileageKm,
      average_fuel_consumption_l_per_100km:
        segment.averageFuelConsumptionLPer100Km,
      fuel_consumed_l: segment.fuelConsumedL,
      average_speed_kmh: segment.averageSpeedKmh,
      max_speed_kmh: segment.maxSpeedKmh,
      starting_fuel_l: segment.startingFuelL,
      ending_fuel_l: segment.endingFuelL,
      raw_row: segment.rawRow,
    }));

    const todaySegmentsNewestFirst = [...segments]
      .sort((a, b) => b.ended_at.localeCompare(a.ended_at))
      .map((segment) => ({
        mileage_km: segment.mileage_km,
        fuel_consumed_l: segment.fuel_consumed_l,
      }));

    const historicalSegments = await getRecentTripSegmentsForVehicle({
      vehicleId: input.vehicle.id,
      beforeEndedAt: input.interval.intervalStart.toISOString(),
    });

    const rolling = calculateRolling1000KmConsumption([
      ...todaySegmentsNewestFirst,
      ...historicalSegments.map((segment) => ({
        mileage_km: segment.mileage_km,
        fuel_consumed_l: segment.fuel_consumed_l,
      })),
    ]);

    // TODO: precise time/distance above 86 km/h requires a separate Wialon report or raw GPS messages.
    const dailyTrip: DailyTripUpsert = {
      vehicle_id: input.vehicle.id,
      ingestion_run_id: input.ingestionRunId,
      report_date: input.interval.reportDate,
      interval_start: input.interval.intervalStart.toISOString(),
      interval_end: input.interval.intervalEnd.toISOString(),
      mileage_km: mileageKm,
      urban_mileage_km: urbanMileageKm,
      highway_mileage_km: highwayMileageKm,
      highway_ratio: highwayRatio,
      max_speed_kmh: fuelParsed.daily.maxSpeedKmh,
      average_speed_kmh: fuelParsed.daily.averageSpeedKmh,
      parking_count: fuelParsed.daily.parkingCount,
      starting_fuel_l: fuelParsed.daily.startingFuelL,
      ending_fuel_l: fuelParsed.daily.endingFuelL,
      fuel_consumed_l: fuelParsed.daily.fuelConsumedL,
      average_fuel_consumption_l_per_100km:
        fuelParsed.daily.averageFuelConsumptionLPer100Km,
      refill_count: fuelParsed.daily.refillCount,
      refilled_l: fuelParsed.daily.refilledL,
      drain_count: fuelParsed.daily.drainCount,
      drained_l: fuelParsed.daily.drainedL,
      route_tag: route.routeTag,
      route_key: route.routeKey,
      start_country_code: route.startCountryCode,
      start_city: route.startCity,
      start_address: route.startAddress,
      end_country_code: route.endCountryCode,
      end_city: route.endCity,
      end_address: route.endAddress,
      baseline_scope: null,
      baseline_sample_size: null,
      baseline_average_l_per_100km: null,
      baseline_stddev_l_per_100km: null,
      deviation_percent: null,
      anomaly_status: fuelStatus,
      is_anomaly: fuelStatus === "high",
      movement_duration_seconds: tripsDailyStats.movementDurationSeconds,
      stop_count: tripsDailyStats.stopCount,
      parking_duration_seconds: tripsDailyStats.parkingDurationSeconds,
      parking_count_from_trips: tripsDailyStats.parkingCountFromTrips,
      rolling_1000km_distance_km: rolling?.distanceKm ?? null,
      rolling_1000km_fuel_l: rolling?.fuelL ?? null,
      rolling_1000km_consumption_l_per_100km: rolling?.consumptionLPer100Km ?? null,
      raw_report_stats: {
        fuel: fuelParsed.daily.rawReportStats,
        trips: tripsDailyStats.rawReportStats,
        warnings,
        countriesVisited: route.countriesVisited,
      },
    };

    const fuelEvents: FuelEventUpsert[] = fuelEventsParsed.events.map(
      (event) => ({
        vehicle_id: input.vehicle.id,
        event_type: event.eventType,
        event_time: toIsoTimestamp(
          event.eventTime,
          input.timezone,
          input.interval.reportDate,
        ),
        volume_l: event.volumeL,
        latitude: event.latitude,
        longitude: event.longitude,
        address: event.address,
        source_table_index: 0,
        source_row_number: event.sourceRowNumber,
        raw_event: event.rawEvent,
      }),
    );

    await upsertDailyTripWithSegments({
      dailyTrip,
      segments,
      fuelEvents,
    });

    log("info", "vehicle_processed", {
      reportDate: input.interval.reportDate,
      wialonUnitId: input.vehicle.wialon_unit_id,
      durationMs: Date.now() - startedAt,
    });

    return {
      success: true,
      vehicle: input.vehicle,
      warnings,
      summary: {
        displayName: input.vehicle.display_name,
        tractorNumber: input.vehicle.tractor_number,
        mileageKm,
        fuelConsumedL: fuelParsed.daily.fuelConsumedL,
        averageFuelConsumptionLPer100Km:
          fuelParsed.daily.averageFuelConsumptionLPer100Km,
        deviationPercent: null,
        baselineAverageLPer100Km: null,
        anomalyStatus: fuelStatus,
        routeKey: route.routeKey,
        highwayRatio,
        firstTripAt: tripWindow.firstTripAt,
        lastTripAt: tripWindow.lastTripAt,
        refillCount: fuelParsed.daily.refillCount,
        refilledL: fuelParsed.daily.refilledL,
        drainCount: fuelParsed.daily.drainCount,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const wialonCode = error instanceof WialonError ? error.code : undefined;
    log("error", "vehicle_failed", {
      reportDate: input.interval.reportDate,
      wialonUnitId: input.vehicle.wialon_unit_id,
      message,
      wialonErrorCode: wialonCode,
    });
    return {
      success: false,
      vehicle: input.vehicle,
      error: message,
      warnings,
    };
  } finally {
    await client.logout();
  }
}
