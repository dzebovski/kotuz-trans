import type { BaselineHistoryRow } from "@/analytics/baseline";
import type { RangeDailyTrip } from "@/analytics/range-report";
import { getSupabaseAdmin } from "./supabase-admin";

export type DailyTripUpsert = {
  vehicle_id: string;
  ingestion_run_id: string;
  report_date: string;
  interval_start: string;
  interval_end: string;
  mileage_km: number;
  urban_mileage_km: number;
  highway_mileage_km: number;
  highway_ratio: number | null;
  max_speed_kmh: number | null;
  average_speed_kmh: number | null;
  parking_count: number;
  starting_fuel_l: number | null;
  ending_fuel_l: number | null;
  fuel_consumed_l: number | null;
  average_fuel_consumption_l_per_100km: number | null;
  refill_count: number;
  refilled_l: number;
  drain_count: number;
  drained_l: number;
  route_tag: string | null;
  route_key: string | null;
  start_country_code: string | null;
  start_city: string | null;
  start_address: string | null;
  end_country_code: string | null;
  end_city: string | null;
  end_address: string | null;
  baseline_scope: string | null;
  baseline_sample_size: number | null;
  baseline_average_l_per_100km: number | null;
  baseline_stddev_l_per_100km: number | null;
  deviation_percent: number | null;
  anomaly_status: string;
  is_anomaly: boolean;
  movement_duration_seconds: number | null;
  stop_count: number;
  parking_duration_seconds: number | null;
  parking_count_from_trips: number;
  rolling_1000km_distance_km: number | null;
  rolling_1000km_fuel_l: number | null;
  rolling_1000km_consumption_l_per_100km: number | null;
  raw_report_stats: unknown;
};

export type TripSegmentUpsert = {
  source_table_index: number;
  source_row_number: number;
  segment_type: string;
  started_at: string;
  ended_at: string;
  duration_seconds: number | null;
  mileage_km: number;
  is_local_maneuver: boolean;
  start_latitude: number | null;
  start_longitude: number | null;
  start_country_code: string | null;
  start_city: string | null;
  start_address: string | null;
  end_latitude: number | null;
  end_longitude: number | null;
  end_country_code: string | null;
  end_city: string | null;
  end_address: string | null;
  urban_mileage_km: number | null;
  highway_mileage_km: number | null;
  average_fuel_consumption_l_per_100km: number | null;
  fuel_consumed_l: number | null;
  average_speed_kmh: number | null;
  max_speed_kmh: number | null;
  starting_fuel_l: number | null;
  ending_fuel_l: number | null;
  raw_row: Record<string, unknown>;
};

export type FuelEventUpsert = {
  vehicle_id: string;
  event_type: "refill" | "drain";
  event_time: string;
  volume_l: number;
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  source_table_index: number | null;
  source_row_number: number | null;
  raw_event: Record<string, unknown>;
};

export async function getBaselineHistory(
  vehicleId: string,
  reportDate: string,
  lookbackDays: number,
): Promise<BaselineHistoryRow[]> {
  const fromDate = new Date(reportDate);
  fromDate.setUTCDate(fromDate.getUTCDate() - lookbackDays);
  const fromIso = fromDate.toISOString().slice(0, 10);

  const { data, error } = await getSupabaseAdmin()
    .from("daily_trips")
    .select(
      "report_date,route_key,route_tag,average_fuel_consumption_l_per_100km,mileage_km,highway_ratio,is_anomaly",
    )
    .eq("vehicle_id", vehicleId)
    .lt("report_date", reportDate)
    .gte("report_date", fromIso);

  if (error) {
    throw new Error(`Failed to load baseline history: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    reportDate: row.report_date as string,
    routeKey: (row.route_key as string | null) ?? null,
    routeTag: (row.route_tag as string | null) ?? null,
    averageFuelConsumptionLPer100Km:
      (row.average_fuel_consumption_l_per_100km as number | null) ?? null,
    mileageKm: Number(row.mileage_km),
    highwayRatio: (row.highway_ratio as number | null) ?? null,
    isAnomaly: Boolean(row.is_anomaly),
  }));
}

export type RecentTripSegmentRow = {
  ended_at: string;
  mileage_km: number;
  fuel_consumed_l: number | null;
};

export async function getRecentTripSegmentsForVehicle(input: {
  vehicleId: string;
  beforeEndedAt: string;
  limit?: number;
}): Promise<RecentTripSegmentRow[]> {
  const limit = input.limit ?? 200;
  const { data, error } = await getSupabaseAdmin()
    .from("trip_segments")
    .select(
      `
      ended_at,
      mileage_km,
      fuel_consumed_l,
      daily_trips!inner (
        vehicle_id
      )
    `,
    )
    .eq("daily_trips.vehicle_id", input.vehicleId)
    .lt("ended_at", input.beforeEndedAt)
    .order("ended_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to load recent trip segments: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    ended_at: row.ended_at as string,
    mileage_km: Number(row.mileage_km),
    fuel_consumed_l: (row.fuel_consumed_l as number | null) ?? null,
  }));
}

export async function getTripSegmentsForVehicleThrough(input: {
  vehicleId: string;
  throughEndedAt: string;
  limit?: number;
}): Promise<RecentTripSegmentRow[]> {
  const limit = input.limit ?? 200;
  const { data, error } = await getSupabaseAdmin()
    .from("trip_segments")
    .select(
      `
      ended_at,
      mileage_km,
      fuel_consumed_l,
      daily_trips!inner (
        vehicle_id
      )
    `,
    )
    .eq("daily_trips.vehicle_id", input.vehicleId)
    .lte("ended_at", input.throughEndedAt)
    .order("ended_at", { ascending: false })
    .limit(limit);
  if (error) {
    throw new Error(`Failed to load rolling trip segments: ${error.message}`);
  }
  return (data ?? []).map((row) => ({
    ended_at: row.ended_at as string,
    mileage_km: Number(row.mileage_km),
    fuel_consumed_l:
      row.fuel_consumed_l == null ? null : Number(row.fuel_consumed_l),
  }));
}

export type DerivedMetricDailyTrip = {
  id: string;
  reportDate: string;
  intervalEnd: string;
  routeKey: string | null;
  routeTag: string | null;
  highwayRatio: number | null;
  mileageKm: number;
  averageFuelConsumptionLPer100Km: number | null;
};

export async function listVehicleDailyTripsAfterDate(
  vehicleId: string,
  reportDate: string,
): Promise<DerivedMetricDailyTrip[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("daily_trips")
    .select(
      `
      id,
      report_date,
      interval_end,
      route_key,
      route_tag,
      highway_ratio,
      mileage_km,
      average_fuel_consumption_l_per_100km
    `,
    )
    .eq("vehicle_id", vehicleId)
    .gt("report_date", reportDate)
    .order("report_date");
  if (error) {
    throw new Error(`Failed to load future daily trips: ${error.message}`);
  }
  return (data ?? []).map((row) => ({
    id: row.id as string,
    reportDate: row.report_date as string,
    intervalEnd: row.interval_end as string,
    routeKey: (row.route_key as string | null) ?? null,
    routeTag: (row.route_tag as string | null) ?? null,
    highwayRatio:
      row.highway_ratio == null ? null : Number(row.highway_ratio),
    mileageKm: Number(row.mileage_km),
    averageFuelConsumptionLPer100Km:
      row.average_fuel_consumption_l_per_100km == null
        ? null
        : Number(row.average_fuel_consumption_l_per_100km),
  }));
}

export async function updateDailyTripDerivedMetrics(input: {
  dailyTripId: string;
  baselineScope: string | null;
  baselineSampleSize: number | null;
  baselineAverageLPer100Km: number | null;
  baselineStddevLPer100Km: number | null;
  deviationPercent: number | null;
  anomalyStatus: string;
  isAnomaly: boolean;
  rollingDistanceKm: number | null;
  rollingFuelL: number | null;
  rollingConsumptionLPer100Km: number | null;
}): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from("daily_trips")
    .update({
      baseline_scope: input.baselineScope,
      baseline_sample_size: input.baselineSampleSize,
      baseline_average_l_per_100km: input.baselineAverageLPer100Km,
      baseline_stddev_l_per_100km: input.baselineStddevLPer100Km,
      deviation_percent: input.deviationPercent,
      anomaly_status: input.anomalyStatus,
      is_anomaly: input.isAnomaly,
      rolling_1000km_distance_km: input.rollingDistanceKm,
      rolling_1000km_fuel_l: input.rollingFuelL,
      rolling_1000km_consumption_l_per_100km:
        input.rollingConsumptionLPer100Km,
    })
    .eq("id", input.dailyTripId);
  if (error) {
    throw new Error(`Failed to update derived metrics: ${error.message}`);
  }
}

export async function listDailyTripsForReportDate(reportDate: string): Promise<
  Array<{
    id: string;
    report_date: string;
    mileage_km: number;
    fuel_consumed_l: number | null;
    average_fuel_consumption_l_per_100km: number | null;
    route_key: string | null;
    route_tag: string | null;
    anomaly_status: string;
    deviation_percent: number | null;
    start_address: string | null;
    end_address: string | null;
    movement_duration_seconds: number | null;
    stop_count: number;
    parking_duration_seconds: number | null;
    parking_count_from_trips: number;
    max_speed_kmh: number | null;
    average_speed_kmh: number | null;
    starting_fuel_l: number | null;
    ending_fuel_l: number | null;
    rolling_1000km_distance_km: number | null;
    rolling_1000km_fuel_l: number | null;
    rolling_1000km_consumption_l_per_100km: number | null;
    vehicle: {
      display_name: string;
      tractor_number: string;
      wialon_unit_id: number;
    };
    segments: Array<{
      id: string;
      started_at: string;
      ended_at: string;
      duration_seconds: number | null;
      mileage_km: number;
      fuel_consumed_l: number | null;
      average_speed_kmh: number | null;
      max_speed_kmh: number | null;
      start_city: string | null;
      end_city: string | null;
      start_address: string | null;
      end_address: string | null;
      is_local_maneuver: boolean;
    }>;
  }>
> {
  const { data, error } = await getSupabaseAdmin()
    .from("daily_trips")
    .select(
      `
      id,
      report_date,
      mileage_km,
      fuel_consumed_l,
      average_fuel_consumption_l_per_100km,
      route_key,
      route_tag,
      anomaly_status,
      deviation_percent,
      start_address,
      end_address,
      movement_duration_seconds,
      stop_count,
      parking_duration_seconds,
      parking_count_from_trips,
      max_speed_kmh,
      average_speed_kmh,
      starting_fuel_l,
      ending_fuel_l,
      rolling_1000km_distance_km,
      rolling_1000km_fuel_l,
      rolling_1000km_consumption_l_per_100km,
      vehicles!inner (
        display_name,
        tractor_number,
        wialon_unit_id
      ),
      trip_segments (
        id,
        started_at,
        ended_at,
        duration_seconds,
        mileage_km,
        fuel_consumed_l,
        average_speed_kmh,
        max_speed_kmh,
        start_city,
        end_city,
        start_address,
        end_address,
        is_local_maneuver
      )
    `,
    )
    .eq("report_date", reportDate)
    .order("mileage_km", { ascending: false });

  if (error) {
    throw new Error(`Failed to load daily trips: ${error.message}`);
  }

  return (data ?? []).map((row) => {
    const vehicleRaw = row.vehicles as
      | {
          display_name: string;
          tractor_number: string;
          wialon_unit_id: number;
        }
      | Array<{
          display_name: string;
          tractor_number: string;
          wialon_unit_id: number;
        }>;
    const vehicle = Array.isArray(vehicleRaw) ? vehicleRaw[0] : vehicleRaw;
    if (!vehicle) {
      throw new Error("Daily trip is missing vehicle relation");
    }
    const segments = ((row.trip_segments as Array<Record<string, unknown>>) ?? [])
      .map((segment) => ({
        id: segment.id as string,
        started_at: segment.started_at as string,
        ended_at: segment.ended_at as string,
        duration_seconds: (segment.duration_seconds as number | null) ?? null,
        mileage_km: Number(segment.mileage_km),
        fuel_consumed_l: (segment.fuel_consumed_l as number | null) ?? null,
        average_speed_kmh: (segment.average_speed_kmh as number | null) ?? null,
        max_speed_kmh: (segment.max_speed_kmh as number | null) ?? null,
        start_city: (segment.start_city as string | null) ?? null,
        end_city: (segment.end_city as string | null) ?? null,
        start_address: (segment.start_address as string | null) ?? null,
        end_address: (segment.end_address as string | null) ?? null,
        is_local_maneuver: Boolean(segment.is_local_maneuver),
      }))
      .sort((a, b) => a.started_at.localeCompare(b.started_at));

    return {
      id: row.id as string,
      report_date: row.report_date as string,
      mileage_km: Number(row.mileage_km),
      fuel_consumed_l: (row.fuel_consumed_l as number | null) ?? null,
      average_fuel_consumption_l_per_100km:
        (row.average_fuel_consumption_l_per_100km as number | null) ?? null,
      route_key: (row.route_key as string | null) ?? null,
      route_tag: (row.route_tag as string | null) ?? null,
      anomaly_status: row.anomaly_status as string,
      deviation_percent: (row.deviation_percent as number | null) ?? null,
      start_address: (row.start_address as string | null) ?? null,
      end_address: (row.end_address as string | null) ?? null,
      movement_duration_seconds:
        (row.movement_duration_seconds as number | null) ?? null,
      stop_count: Number(row.stop_count ?? 0),
      parking_duration_seconds:
        (row.parking_duration_seconds as number | null) ?? null,
      parking_count_from_trips: Number(row.parking_count_from_trips ?? 0),
      max_speed_kmh: (row.max_speed_kmh as number | null) ?? null,
      average_speed_kmh: (row.average_speed_kmh as number | null) ?? null,
      starting_fuel_l: (row.starting_fuel_l as number | null) ?? null,
      ending_fuel_l: (row.ending_fuel_l as number | null) ?? null,
      rolling_1000km_distance_km:
        (row.rolling_1000km_distance_km as number | null) ?? null,
      rolling_1000km_fuel_l: (row.rolling_1000km_fuel_l as number | null) ?? null,
      rolling_1000km_consumption_l_per_100km:
        (row.rolling_1000km_consumption_l_per_100km as number | null) ?? null,
      vehicle,
      segments,
    };
  });
}

export async function listDailyTripsForDates(
  dates: string[],
): Promise<RangeDailyTrip[]> {
  if (dates.length === 0) {
    return [];
  }
  const { data, error } = await getSupabaseAdmin()
    .from("daily_trips")
    .select(
      `
      id,
      report_date,
      mileage_km,
      fuel_consumed_l,
      average_fuel_consumption_l_per_100km,
      rolling_1000km_consumption_l_per_100km,
      movement_duration_seconds,
      parking_count_from_trips,
      parking_duration_seconds,
      max_speed_kmh,
      anomaly_status,
      route_key,
      vehicles!inner (
        id,
        display_name,
        tractor_number,
        wialon_unit_id
      )
    `,
    )
    .in("report_date", dates)
    .order("report_date");
  if (error) {
    throw new Error(`Failed to load trips for dates: ${error.message}`);
  }

  return (data ?? []).map((row) => {
    const relation = row.vehicles as unknown;
    const vehicle = (Array.isArray(relation) ? relation[0] : relation) as {
      id: string;
      display_name: string;
      tractor_number: string;
      wialon_unit_id: number;
    };
    return {
      id: row.id as string,
      reportDate: row.report_date as string,
      mileageKm: Number(row.mileage_km),
      fuelConsumedL:
        row.fuel_consumed_l == null ? null : Number(row.fuel_consumed_l),
      averageFuelConsumptionLPer100Km:
        row.average_fuel_consumption_l_per_100km == null
          ? null
          : Number(row.average_fuel_consumption_l_per_100km),
      rolling1000KmConsumptionLPer100Km:
        row.rolling_1000km_consumption_l_per_100km == null
          ? null
          : Number(row.rolling_1000km_consumption_l_per_100km),
      movementDurationSeconds:
        (row.movement_duration_seconds as number | null) ?? null,
      parkingCount: Number(row.parking_count_from_trips ?? 0),
      parkingDurationSeconds:
        (row.parking_duration_seconds as number | null) ?? null,
      maxSpeedKmh:
        row.max_speed_kmh == null ? null : Number(row.max_speed_kmh),
      anomalyStatus: row.anomaly_status as string,
      routeKey: (row.route_key as string | null) ?? null,
      vehicle: {
        id: vehicle.id,
        displayName: vehicle.display_name,
        tractorNumber: vehicle.tractor_number,
        wialonUnitId: Number(vehicle.wialon_unit_id),
      },
    };
  });
}

export async function listDailyTripsForRange(
  from: string,
  to: string,
): Promise<RangeDailyTrip[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("daily_trips")
    .select(
      `
      id,
      report_date,
      mileage_km,
      fuel_consumed_l,
      average_fuel_consumption_l_per_100km,
      rolling_1000km_consumption_l_per_100km,
      movement_duration_seconds,
      parking_count_from_trips,
      parking_duration_seconds,
      max_speed_kmh,
      anomaly_status,
      route_key,
      vehicles!inner (
        id,
        display_name,
        tractor_number,
        wialon_unit_id
      )
    `,
    )
    .gte("report_date", from)
    .lte("report_date", to)
    .order("report_date");
  if (error) {
    throw new Error(`Failed to load date range trips: ${error.message}`);
  }

  return (data ?? []).map((row) => {
    const relation = row.vehicles as unknown;
    const vehicle = (Array.isArray(relation) ? relation[0] : relation) as {
      id: string;
      display_name: string;
      tractor_number: string;
      wialon_unit_id: number;
    };
    return {
      id: row.id as string,
      reportDate: row.report_date as string,
      mileageKm: Number(row.mileage_km),
      fuelConsumedL:
        row.fuel_consumed_l == null ? null : Number(row.fuel_consumed_l),
      averageFuelConsumptionLPer100Km:
        row.average_fuel_consumption_l_per_100km == null
          ? null
          : Number(row.average_fuel_consumption_l_per_100km),
      rolling1000KmConsumptionLPer100Km:
        row.rolling_1000km_consumption_l_per_100km == null
          ? null
          : Number(row.rolling_1000km_consumption_l_per_100km),
      movementDurationSeconds:
        (row.movement_duration_seconds as number | null) ?? null,
      parkingCount: Number(row.parking_count_from_trips ?? 0),
      parkingDurationSeconds:
        (row.parking_duration_seconds as number | null) ?? null,
      maxSpeedKmh:
        row.max_speed_kmh == null ? null : Number(row.max_speed_kmh),
      anomalyStatus: row.anomaly_status as string,
      routeKey: (row.route_key as string | null) ?? null,
      vehicle: {
        id: vehicle.id,
        displayName: vehicle.display_name,
        tractorNumber: vehicle.tractor_number,
        wialonUnitId: Number(vehicle.wialon_unit_id),
      },
    };
  });
}

export async function listTripSegmentsForDailyTrip(dailyTripId: string) {
  const { data, error } = await getSupabaseAdmin()
    .from("trip_segments")
    .select(
      `
      id,
      started_at,
      ended_at,
      duration_seconds,
      mileage_km,
      fuel_consumed_l,
      average_speed_kmh,
      max_speed_kmh,
      start_address,
      end_address,
      is_local_maneuver
    `,
    )
    .eq("daily_trip_id", dailyTripId)
    .order("started_at");
  if (error) {
    throw new Error(`Failed to load trip details: ${error.message}`);
  }
  return (data ?? []).map((row) => ({
    id: row.id as string,
    started_at: row.started_at as string,
    ended_at: row.ended_at as string,
    duration_seconds: (row.duration_seconds as number | null) ?? null,
    mileage_km: Number(row.mileage_km),
    fuel_consumed_l:
      row.fuel_consumed_l == null ? null : Number(row.fuel_consumed_l),
    average_speed_kmh:
      row.average_speed_kmh == null ? null : Number(row.average_speed_kmh),
    max_speed_kmh:
      row.max_speed_kmh == null ? null : Number(row.max_speed_kmh),
    start_address: (row.start_address as string | null) ?? null,
    end_address: (row.end_address as string | null) ?? null,
    is_local_maneuver: Boolean(row.is_local_maneuver),
  }));
}

export async function upsertDailyTripWithSegments(input: {
  dailyTrip: DailyTripUpsert;
  segments: TripSegmentUpsert[];
  fuelEvents: FuelEventUpsert[];
}): Promise<string> {
  const supabase = getSupabaseAdmin();

  const { data: tripData, error: tripError } = await supabase
    .from("daily_trips")
    .upsert(input.dailyTrip, { onConflict: "vehicle_id,report_date" })
    .select("id")
    .single();

  if (tripError) {
    throw new Error(`Failed to upsert daily trip: ${tripError.message}`);
  }

  const dailyTripId = tripData.id as string;

  if (input.segments.length > 0) {
    const segmentRows = input.segments.map((segment) => ({
      ...segment,
      daily_trip_id: dailyTripId,
    }));
    const { error: segmentError } = await supabase
      .from("trip_segments")
      .upsert(segmentRows, {
        onConflict: "daily_trip_id,source_table_index,source_row_number",
      });
    if (segmentError) {
      throw new Error(`Failed to upsert trip segments: ${segmentError.message}`);
    }

    const keepKeys = new Set(
      input.segments.map(
        (segment) => `${segment.source_table_index}:${segment.source_row_number}`,
      ),
    );
    const { data: existingSegments, error: existingError } = await supabase
      .from("trip_segments")
      .select("id,source_table_index,source_row_number")
      .eq("daily_trip_id", dailyTripId);
    if (existingError) {
      throw new Error(`Failed to read existing segments: ${existingError.message}`);
    }
    const staleIds = (existingSegments ?? [])
      .filter(
        (segment) =>
          !keepKeys.has(
            `${segment.source_table_index as number}:${segment.source_row_number as number}`,
          ),
      )
      .map((segment) => segment.id as string);
    if (staleIds.length > 0) {
      const { error: deleteError } = await supabase
        .from("trip_segments")
        .delete()
        .in("id", staleIds);
      if (deleteError) {
        throw new Error(`Failed to delete stale segments: ${deleteError.message}`);
      }
    }
  } else {
    const { error: deleteAllError } = await supabase
      .from("trip_segments")
      .delete()
      .eq("daily_trip_id", dailyTripId);
    if (deleteAllError) {
      throw new Error(`Failed to clear trip segments: ${deleteAllError.message}`);
    }
  }

  if (input.fuelEvents.length > 0) {
    const fuelRows = input.fuelEvents.map((event) => ({
      ...event,
      daily_trip_id: dailyTripId,
    }));
    const { error: fuelError } = await supabase
      .from("fuel_events")
      .upsert(fuelRows, {
        onConflict: "vehicle_id,event_type,event_time,volume_l",
      });
    if (fuelError) {
      throw new Error(`Failed to upsert fuel events: ${fuelError.message}`);
    }

    const keepKeys = new Set(
      input.fuelEvents.map(
        (event) =>
          `${event.vehicle_id}:${event.event_type}:${event.event_time}:${event.volume_l}`,
      ),
    );
    const { data: existingFuelEvents, error: existingFuelError } = await supabase
      .from("fuel_events")
      .select("id,vehicle_id,event_type,event_time,volume_l")
      .eq("daily_trip_id", dailyTripId);
    if (existingFuelError) {
      throw new Error(
        `Failed to read existing fuel events: ${existingFuelError.message}`,
      );
    }
    const staleFuelEventIds = (existingFuelEvents ?? [])
      .filter(
        (event) =>
          !keepKeys.has(
            `${event.vehicle_id as string}:${event.event_type as string}:${event.event_time as string}:${Number(event.volume_l)}`,
          ),
      )
      .map((event) => event.id as string);
    if (staleFuelEventIds.length > 0) {
      const { error: deleteFuelError } = await supabase
        .from("fuel_events")
        .delete()
        .in("id", staleFuelEventIds);
      if (deleteFuelError) {
        throw new Error(
          `Failed to delete stale fuel events: ${deleteFuelError.message}`,
        );
      }
    }
  } else {
    const { error: deleteFuelError } = await supabase
      .from("fuel_events")
      .delete()
      .eq("daily_trip_id", dailyTripId);
    if (deleteFuelError) {
      throw new Error(`Failed to clear fuel events: ${deleteFuelError.message}`);
    }
  }

  return dailyTripId;
}
