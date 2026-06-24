import { NextRequest, NextResponse } from "next/server";
import { aggregateTripsByVehicle } from "@/analytics/range-report";
import { getServerEnv } from "@/config/env";
import { listIngestionQueueForRange } from "@/db/ingestion-queue-repository";
import { listIngestionRunsForRange } from "@/db/ingestion-runs-repository";
import { listDailyTripsForDates } from "@/db/trips-repository";
import { DAILY_FLEET_REPORT_JOB_NAME } from "@/jobs/run-daily-fleet-report";
import { requireUser } from "@/lib/auth/require-user";
import { validateReportRange } from "@/utils/report-range";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await requireUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const env = getServerEnv();
    const from = request.nextUrl.searchParams.get("from");
    const to = request.nextUrl.searchParams.get("to");
    if (!from || !to) {
      return NextResponse.json(
        { error: "Expected from and to query parameters" },
        { status: 400 },
      );
    }
    const range = validateReportRange({
      from,
      to,
      timezone: env.BUSINESS_TIMEZONE,
    });
    if (!range.ok) {
      return NextResponse.json({ error: range.error }, { status: 400 });
    }

    const [runs, queue] = await Promise.all([
      listIngestionRunsForRange(
        DAILY_FLEET_REPORT_JOB_NAME,
        range.from,
        range.to,
      ),
      listIngestionQueueForRange(
        DAILY_FLEET_REPORT_JOB_NAME,
        range.from,
        range.to,
      ),
    ]);
    const runByDate = new Map(runs.map((run) => [run.report_date, run]));
    const queueByDate = new Map(queue.map((item) => [item.report_date, item]));

    const coverage = range.dates.map((date) => {
      const run = runByDate.get(date);
      const queueItem = queueByDate.get(date);
      const isToday = date === range.today;
      const ready =
        run?.status === "completed" && (isToday || run.is_final === true);
      let state:
        | "ready"
        | "provisional"
        | "missing"
        | "queued"
        | "running"
        | "partial"
        | "failed" = "missing";
      if (ready) {
        state = isToday && !run?.is_final ? "provisional" : "ready";
      } else if (queueItem?.status === "failed") {
        state = "failed";
      } else if (
        run?.status === "running" ||
        queueItem?.status === "running"
      ) {
        state = "running";
      } else if (queueItem?.status === "pending") {
        state = "queued";
      } else if (run?.status === "partial") {
        state = "partial";
      } else if (run?.status === "failed") {
        state = "failed";
      } else if (run?.status === "completed" && !run.is_final) {
        state = "provisional";
      }

      return {
        date,
        state,
        ready,
        isToday,
        successfulVehicles: run?.successful_vehicles ?? 0,
        failedVehicles: run?.failed_vehicles ?? 0,
        expectedVehicles: run?.expected_vehicles ?? 0,
        queueAttempts: queueItem?.attempts ?? 0,
        lastError: queueItem?.last_error ?? null,
        updatedAt:
          queueItem?.updated_at ??
          run?.completed_at ??
          run?.heartbeat_at ??
          null,
      };
    });

    const ready = coverage.every((day) => day.ready);
    const readyDates = coverage.filter((day) => day.ready).map((day) => day.date);
    const partialReady = readyDates.length > 0 && !ready;
    const trips =
      readyDates.length > 0
        ? await listDailyTripsForDates(readyDates)
        : [];
    const vehicles = trips.length > 0 ? aggregateTripsByVehicle(trips) : [];
    const summary =
      vehicles.length > 0
        ? {
            vehicleCount: vehicles.length,
            dateCount: readyDates.length,
            totalMileageKm: vehicles.reduce(
              (sum, vehicle) => sum + vehicle.mileageKm,
              0,
            ),
            totalFuelL: vehicles.reduce(
              (sum, vehicle) => sum + vehicle.fuelConsumedL,
              0,
            ),
            totalMovementSeconds: vehicles.reduce(
              (sum, vehicle) => sum + vehicle.movementDurationSeconds,
              0,
            ),
            vehiclesOverSpeedLimit: vehicles.filter(
              (vehicle) => (vehicle.maxSpeedKmh ?? 0) > 86,
            ).length,
            anomalyVehicles: vehicles.filter(
              (vehicle) => vehicle.anomalyDays > 0,
            ).length,
          }
        : null;

    return NextResponse.json({
      range: { from: range.from, to: range.to, today: range.today },
      ready,
      partialReady,
      coverage,
      summary,
      vehicles,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

