import { NextRequest, NextResponse } from "next/server";
import {
  aggregateTripsByVehicle,
  type RangeDailyTrip,
} from "@/analytics/range-report";
import { buildVehicleCoverageState } from "@/lib/report/coverage";
import { getServerEnv } from "@/config/env";
import { listVehicleIngestionStatusForRange } from "@/db/ingestion-runs-repository";
import { listDailyTripsForVehicleInRange } from "@/db/trips-repository";
import { getVehicleById } from "@/db/vehicles-repository";
import { DAILY_FLEET_REPORT_JOB_NAME } from "@/jobs/run-daily-fleet-report";
import { requireUser } from "@/lib/auth/require-user";
import type { CoverageDay } from "@/lib/report/types";
import { validateReportRange } from "@/utils/report-range";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ vehicleId: string }>;
};

export async function GET(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  try {
    const user = await requireUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { vehicleId } = await context.params;
    const from = request.nextUrl.searchParams.get("from");
    const to = request.nextUrl.searchParams.get("to");
    if (!from || !to) {
      return NextResponse.json(
        { error: "Expected from and to query parameters" },
        { status: 400 },
      );
    }

    const vehicle = await getVehicleById(vehicleId);
    if (!vehicle) {
      return NextResponse.json({ error: "Vehicle not found" }, { status: 404 });
    }

    const env = getServerEnv();
    const range = validateReportRange({
      from,
      to,
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

    const tripByDate = new Map(trips.map((trip) => [trip.reportDate, trip]));
    const ingestionByDate = new Map(
      ingestionRows.map((row) => [row.reportDate, row]),
    );

    const coverage: CoverageDay[] = range.dates.map((date) => {
      const trip = tripByDate.get(date);
      const ingestion = ingestionByDate.get(date);
      const isToday = date === range.today;
      const { state, ready } = buildVehicleCoverageState({
        date,
        today: range.today,
        hasTrip: Boolean(trip),
        hasIngestionRun: ingestion != null,
        fleetRunIsFinal: ingestion?.runIsFinal ?? false,
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

    const ready = coverage.every((day) => day.ready);
    const readyTrips = trips.filter((trip) =>
      coverage.find((day) => day.date === trip.reportDate)?.ready,
    );
    const partialReady = readyTrips.length > 0 && !ready;
    const vehicles =
      readyTrips.length > 0
        ? aggregateTripsByVehicle(readyTrips as RangeDailyTrip[])
        : [];

    return NextResponse.json({
      range: { from: range.from, to: range.to, today: range.today },
      ready,
      partialReady,
      coverage,
      vehicle: vehicles[0] ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
