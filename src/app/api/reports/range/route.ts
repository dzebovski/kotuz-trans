import { NextRequest, NextResponse } from "next/server";
import { countFuelStatusByVehicle } from "@/analytics/fuel-consumption-status";
import { aggregateTripsByVehicle } from "@/analytics/range-report";
import { getServerEnv } from "@/config/env";
import { listIngestionQueueForRange } from "@/db/ingestion-queue-repository";
import { listIngestionRunsForRange } from "@/db/ingestion-runs-repository";
import { listDailyTripsForDates } from "@/db/trips-repository";
import { DAILY_FLEET_REPORT_JOB_NAME } from "@/jobs/run-daily-fleet-report";
import { buildFleetCoverageDays } from "@/lib/report/build-fleet-coverage";
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
    const coverage = buildFleetCoverageDays({
      dates: range.dates,
      today: range.today,
      runs,
      queue,
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
            totalOverSpeedLimitSeconds: vehicles.reduce(
              (sum, vehicle) => sum + vehicle.overSpeedLimitDurationSeconds,
              0,
            ),
            fuelStatusCounts: countFuelStatusByVehicle(vehicles),
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

