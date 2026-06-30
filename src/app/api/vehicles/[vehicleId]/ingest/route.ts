import { NextRequest, NextResponse } from "next/server";
import {
  buildVehicleCoverageState,
  isFleetRunActivelyProcessing,
} from "@/lib/report/coverage";
import { getServerEnv } from "@/config/env";
import { listVehicleIngestionStatusForRange } from "@/db/ingestion-runs-repository";
import { listDailyTripsForVehicleInRange } from "@/db/trips-repository";
import { getVehicleById } from "@/db/vehicles-repository";
import {
  findNextVehicleIngestDate,
  ingestVehicleForDate,
} from "@/jobs/ingest-vehicle-date";
import { DAILY_FLEET_REPORT_JOB_NAME } from "@/jobs/run-daily-fleet-report";
import { requireUser } from "@/lib/auth/require-user";
import type { CoverageDay } from "@/lib/report/types";
import { validateReportRange } from "@/utils/report-range";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type RouteContext = {
  params: Promise<{ vehicleId: string }>;
};

function buildCoverage(
  dates: string[],
  today: string,
  trips: Awaited<ReturnType<typeof listDailyTripsForVehicleInRange>>,
  ingestionRows: Awaited<ReturnType<typeof listVehicleIngestionStatusForRange>>,
): CoverageDay[] {
  const tripByDate = new Map(trips.map((trip) => [trip.reportDate, trip]));
  const ingestionByDate = new Map(
    ingestionRows.map((row) => [row.reportDate, row]),
  );

  return dates.map((date) => {
    const trip = tripByDate.get(date);
    const ingestion = ingestionByDate.get(date);
    const isToday = date === today;
    const { state, ready } = buildVehicleCoverageState({
      date,
      today,
      hasTrip: Boolean(trip),
      tripIsFinal: ingestion?.runIsFinal ?? !isToday,
      fleetRunStatus: ingestion?.runStatus ?? null,
      fleetHeartbeatAt: ingestion?.runHeartbeatAt ?? null,
      vehicleRunStatus: ingestion?.vehicleStatus ?? null,
    });

    return {
      date,
      state,
      ready,
      isToday,
      successfulVehicles: ready ? 1 : 0,
      failedVehicles: state === "failed" ? 1 : 0,
      expectedVehicles: 1,
      queueAttempts: 0,
      queueStatus: null,
      queueRunAfter: null,
      lastError: ingestion?.vehicleLastError ?? null,
      updatedAt: null,
    };
  });
}

export async function POST(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  try {
    const user = await requireUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { vehicleId } = await context.params;
    const body = (await request.json()) as {
      from?: unknown;
      to?: unknown;
      mode?: unknown;
      afterDate?: unknown;
    };
    if (
      typeof body.from !== "string" ||
      typeof body.to !== "string" ||
      (body.mode !== "missing" && body.mode !== "force") ||
      (body.afterDate != null && typeof body.afterDate !== "string")
    ) {
      return NextResponse.json(
        {
          error:
            "Expected { from: YYYY-MM-DD, to: YYYY-MM-DD, mode: missing|force }",
        },
        { status: 400 },
      );
    }

    const vehicle = await getVehicleById(vehicleId);
    if (!vehicle) {
      return NextResponse.json({ error: "Vehicle not found" }, { status: 404 });
    }

    const env = getServerEnv();
    const range = validateReportRange({
      from: body.from,
      to: body.to,
      timezone: env.BUSINESS_TIMEZONE,
    });
    if (!range.ok) {
      return NextResponse.json({ error: range.error }, { status: 400 });
    }

    const [trips, ingestionRows] = await Promise.all([
      listDailyTripsForVehicleInRange(vehicleId, range.from, range.to),
      listVehicleIngestionStatusForRange(
        DAILY_FLEET_REPORT_JOB_NAME,
        vehicleId,
        range.from,
        range.to,
      ),
    ]);

    const coverage = buildCoverage(
      range.dates,
      range.today,
      trips,
      ingestionRows,
    );
    const coverageByDate = new Map(
      range.dates.map((date) => {
        const day = coverage.find((item) => item.date === date);
        const ingestion = ingestionRows.find((row) => row.reportDate === date);
        return [
          date,
          {
            ready: day?.ready ?? false,
            state: day?.state ?? "missing",
            fleetRunning: Boolean(
              ingestion?.runStatus === "running" &&
                ingestion.runHeartbeatAt &&
                isFleetRunActivelyProcessing({
                  status: ingestion.runStatus,
                  heartbeatAt: ingestion.runHeartbeatAt,
                }),
            ),
          },
        ] as const;
      }),
    );

    const next = findNextVehicleIngestDate({
      dates: range.dates,
      mode: body.mode,
      afterDate: body.afterDate ?? null,
      coverageByDate,
    });

    if (next.blocked) {
      return NextResponse.json({
        ok: false,
        status: "blocked",
        reason: "fleet_import_running",
      });
    }

    if (!next.date) {
      return NextResponse.json({
        ok: true,
        status: "idle",
      });
    }

    const result = await ingestVehicleForDate({
      vehicleId,
      reportDate: next.date,
      mode: body.mode,
      softDeadlineMs: env.JOB_SOFT_DEADLINE_MS ?? 270_000,
    });

    return NextResponse.json({
      ok:
        result.status === "completed" ||
        result.status === "skipped" ||
        result.status === "partial",
      status: result.status,
      reportDate: result.reportDate,
      reason: result.reason ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
