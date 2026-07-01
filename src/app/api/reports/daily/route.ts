import { NextRequest, NextResponse } from "next/server";
import { DateTime } from "luxon";
import { inferPausesBetweenSegments } from "@/analytics/inferred-pauses";
import { requireUser } from "@/lib/auth/require-user";
import { listDailyTripsForReportDate } from "@/db/trips-repository";
import {
  getIngestionRun,
  type IngestionCurrentVehicle,
  type IngestionPhase,
} from "@/db/ingestion-runs-repository";
import { getPreviousBusinessDay } from "@/utils/time";
import { getServerEnv } from "@/config/env";
import {
  DAILY_FLEET_REPORT_JOB_NAME,
  runDailyFleetReport,
} from "@/jobs/run-daily-fleet-report";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { SPEED_LIMIT_KMH } from "@/analytics/over-speed-duration";
const INGESTION_PHASES = new Set<IngestionPhase>([
  "starting",
  "processing",
  "finalizing",
]);

function readIngestionPhase(
  metadata: Record<string, unknown> | undefined,
): IngestionPhase | null {
  const phase = metadata?.phase;
  return typeof phase === "string" &&
    INGESTION_PHASES.has(phase as IngestionPhase)
    ? (phase as IngestionPhase)
    : null;
}

function readCurrentVehicles(
  metadata: Record<string, unknown> | undefined,
): IngestionCurrentVehicle[] {
  const currentVehicles = metadata?.currentVehicles;
  if (!Array.isArray(currentVehicles)) {
    return [];
  }

  return currentVehicles.flatMap((vehicle) => {
    if (!vehicle || typeof vehicle !== "object") {
      return [];
    }
    const record = vehicle as Record<string, unknown>;
    if (
      typeof record.wialonUnitId !== "number" ||
      typeof record.displayName !== "string"
    ) {
      return [];
    }
    return [{
      wialonUnitId: record.wialonUnitId,
      displayName: record.displayName,
    }];
  });
}

function validateReportDate(
  value: string,
  timezone: string,
): { ok: true; date: string } | { ok: false; error: string } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return { ok: false, error: "Date must use YYYY-MM-DD format" };
  }

  const date = DateTime.fromISO(value, { zone: timezone });
  if (!date.isValid || date.toISODate() !== value) {
    return { ok: false, error: "Invalid report date" };
  }

  const today = DateTime.now().setZone(timezone).startOf("day");
  if (date.startOf("day") > today) {
    return { ok: false, error: "Future report dates are not allowed" };
  }

  return { ok: true, date: value };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await requireUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const env = getServerEnv();
    const date =
      request.nextUrl.searchParams.get("date") ??
      getPreviousBusinessDay(env.BUSINESS_TIMEZONE);
    const validatedDate = validateReportDate(date, env.BUSINESS_TIMEZONE);
    if (!validatedDate.ok) {
      return NextResponse.json(
        { error: validatedDate.error },
        { status: 400 },
      );
    }

    const [trips, ingestionRun] = await Promise.all([
      listDailyTripsForReportDate(validatedDate.date),
      getIngestionRun(DAILY_FLEET_REPORT_JOB_NAME, validatedDate.date),
    ]);
    const rollingConsumptions = trips
      .map((trip) => trip.rolling_1000km_consumption_l_per_100km)
      .filter((value): value is number => value != null);

    const summary = {
      reportDate: validatedDate.date,
      vehicleCount: trips.length,
      totalMileageKm: trips.reduce((sum, trip) => sum + trip.mileage_km, 0),
      totalFuelL: trips.reduce(
        (sum, trip) => sum + (trip.fuel_consumed_l ?? 0),
        0,
      ),
      totalMovementSeconds: trips.reduce(
        (sum, trip) => sum + (trip.movement_duration_seconds ?? 0),
        0,
      ),
      totalOverSpeedLimitSeconds: trips.reduce(
        (sum, trip) => sum + (trip.over_speed_limit_duration_seconds ?? 0),
        0,
      ),
      totalParkingCount: trips.reduce(
        (sum, trip) => sum + trip.parking_count_from_trips,
        0,
      ),
      totalParkingSeconds: trips.reduce(
        (sum, trip) => sum + (trip.parking_duration_seconds ?? 0),
        0,
      ),
      vehiclesOverSpeedLimit: trips.filter(
        (trip) => (trip.max_speed_kmh ?? 0) > SPEED_LIMIT_KMH,
      ).length,
      averageRollingConsumptionLPer100Km:
        rollingConsumptions.length > 0
          ? rollingConsumptions.reduce((sum, value) => sum + value, 0) /
            rollingConsumptions.length
          : null,
      withRoute: trips.filter((trip) => trip.route_key).length,
      withSegments: trips.filter((trip) => trip.segments.length > 0).length,
    };

    const tripsWithPauses = trips.map((trip) => ({
      ...trip,
      speedLimitExceeded: (trip.max_speed_kmh ?? 0) > SPEED_LIMIT_KMH,
      overSpeedLimitDurationSeconds: trip.over_speed_limit_duration_seconds,
      derivedPauses: inferPausesBetweenSegments(trip.segments),
    }));
    const successfulVehicles = ingestionRun?.successful_vehicles ?? 0;
    const failedVehicles = ingestionRun?.failed_vehicles ?? 0;

    return NextResponse.json({
      summary,
      trips: tripsWithPauses,
      ingestion: {
        status: ingestionRun?.status ?? null,
        successfulVehicles,
        failedVehicles,
        processedVehicles: successfulVehicles + failedVehicles,
        expectedVehicles: ingestionRun?.expected_vehicles ?? 0,
        startedAt: ingestionRun?.started_at ?? null,
        heartbeatAt: ingestionRun?.heartbeat_at ?? null,
        completedAt: ingestionRun?.completed_at ?? null,
        phase: readIngestionPhase(ingestionRun?.metadata),
        currentVehicles: readCurrentVehicles(ingestionRun?.metadata),
        hasData: trips.length > 0,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await requireUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { date, force = false } = body as {
      date?: unknown;
      force?: unknown;
    };
    if (typeof date !== "string" || typeof force !== "boolean") {
      return NextResponse.json(
        { error: "Expected { date: YYYY-MM-DD, force: boolean }" },
        { status: 400 },
      );
    }

    const env = getServerEnv();
    const validatedDate = validateReportDate(date, env.BUSINESS_TIMEZONE);
    if (!validatedDate.ok) {
      return NextResponse.json(
        { error: validatedDate.error },
        { status: 400 },
      );
    }

    const result = await runDailyFleetReport({
      reportDate: validatedDate.date,
      force,
      sendTelegram: false,
      softDeadlineMs: env.JOB_SOFT_DEADLINE_MS ?? 270_000,
    });

    return NextResponse.json({
      ok: result.status !== "failed",
      status: result.status,
      reportDate: result.reportDate,
      reason: result.reason,
      processed: result.summary?.processed ?? 0,
      expected: result.summary?.expected ?? 0,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
