import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FuelEventUpsert } from "@/db/trips-repository";

type TableCalls = {
  upsert: Array<{ rows: unknown; options?: unknown }>;
  insert: Array<unknown>;
  delete: number;
};

const calls: Record<string, TableCalls> = {};

function tableCalls(table: string): TableCalls {
  calls[table] ??= { upsert: [], insert: [], delete: 0 };
  return calls[table]!;
}

function makeBuilder(table: string) {
  const result =
    table === "daily_trips"
      ? { data: { id: "trip-1" }, error: null }
      : { data: [], error: null };

  const builder: Record<string, unknown> = {
    upsert(rows: unknown, options?: unknown) {
      tableCalls(table).upsert.push({ rows, options });
      return builder;
    },
    insert(rows: unknown) {
      tableCalls(table).insert.push(rows);
      return builder;
    },
    delete() {
      tableCalls(table).delete += 1;
      return builder;
    },
    select: () => builder,
    eq: () => builder,
    in: () => builder,
    order: () => builder,
    single: () => Promise.resolve(result),
    then: (resolve: (value: unknown) => unknown) => resolve(result),
  };
  return builder;
}

const fromMock = vi.fn((table: string) => makeBuilder(table));

vi.mock("@/db/supabase-admin", () => ({
  getSupabaseAdmin: () => ({ from: fromMock }),
}));

import { upsertDailyTripWithSegments } from "@/db/trips-repository";

const baseDailyTrip = {
  vehicle_id: "veh-1",
  ingestion_run_id: "run-1",
  report_date: "2026-06-29",
  interval_start: "2026-06-29T00:00:00.000Z",
  interval_end: "2026-06-30T00:00:00.000Z",
  mileage_km: 0,
  urban_mileage_km: 0,
  highway_mileage_km: 0,
  highway_ratio: null,
  max_speed_kmh: null,
  average_speed_kmh: null,
  parking_count: 0,
  starting_fuel_l: null,
  ending_fuel_l: null,
  fuel_consumed_l: null,
  average_fuel_consumption_l_per_100km: null,
  refill_count: 0,
  refilled_l: 0,
  drain_count: 0,
  drained_l: 0,
  route_tag: null,
  route_key: null,
  start_country_code: null,
  start_city: null,
  start_address: null,
  end_country_code: null,
  end_city: null,
  end_address: null,
  baseline_scope: null,
  baseline_sample_size: null,
  baseline_average_l_per_100km: null,
  baseline_stddev_l_per_100km: null,
  deviation_percent: null,
  anomaly_status: "not_evaluated",
  is_anomaly: false,
  movement_duration_seconds: null,
  stop_count: 0,
  parking_duration_seconds: null,
  parking_count_from_trips: 0,
  rolling_1000km_distance_km: null,
  rolling_1000km_fuel_l: null,
  rolling_1000km_consumption_l_per_100km: null,
  raw_report_stats: {},
};

function fuelEvent(overrides: Partial<FuelEventUpsert>): FuelEventUpsert {
  return {
    vehicle_id: "veh-1",
    event_type: "refill",
    event_time: "2026-06-29T08:00:00.000Z",
    volume_l: 100,
    latitude: null,
    longitude: null,
    address: null,
    source_table_index: 0,
    source_row_number: 0,
    raw_event: {},
    ...overrides,
  };
}

describe("upsertDailyTripWithSegments fuel events", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(calls)) {
      delete calls[key];
    }
  });

  it("upserts fuel events on the natural key instead of plain insert", async () => {
    await upsertDailyTripWithSegments({
      dailyTrip: baseDailyTrip,
      segments: [],
      fuelEvents: [fuelEvent({})],
    });

    const fuelEvents = tableCalls("fuel_events");
    expect(fuelEvents.insert).toHaveLength(0);
    expect(fuelEvents.upsert).toHaveLength(1);
    expect(fuelEvents.upsert[0]!.options).toEqual({
      onConflict: "vehicle_id,event_type,event_time,volume_l",
    });
  });

  it("deduplicates events sharing the same natural key within a batch", async () => {
    await upsertDailyTripWithSegments({
      dailyTrip: baseDailyTrip,
      segments: [],
      fuelEvents: [
        fuelEvent({ source_row_number: 1 }),
        fuelEvent({ source_row_number: 2 }),
        fuelEvent({ volume_l: 50, source_row_number: 3 }),
      ],
    });

    const fuelEvents = tableCalls("fuel_events");
    const rows = fuelEvents.upsert[0]!.rows as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.daily_trip_id === "trip-1")).toBe(true);
  });
});
