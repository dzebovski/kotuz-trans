import { NextRequest, NextResponse } from "next/server";
import { getServerEnv } from "@/config/env";
import { listIngestionEventsForRange } from "@/db/ingestion-events-repository";
import { listIngestionQueueForRange } from "@/db/ingestion-queue-repository";
import { listRunVehiclesWithNamesForRange } from "@/db/ingestion-runs-repository";
import { DAILY_FLEET_REPORT_JOB_NAME } from "@/jobs/run-daily-fleet-report";
import { requireUser } from "@/lib/auth/require-user";
import type {
  CoverageDiagnosticsDay,
  CoverageDiagnosticsResponse,
} from "@/lib/report/types";
import { validateReportRange } from "@/utils/report-range";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await requireUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const from = request.nextUrl.searchParams.get("from");
    const to = request.nextUrl.searchParams.get("to");
    const date = request.nextUrl.searchParams.get("date");
    if (!from || !to) {
      return NextResponse.json(
        { error: "Expected from and to query parameters" },
        { status: 400 },
      );
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

    const [vehicles, events, queue] = await Promise.all([
      listRunVehiclesWithNamesForRange(
        DAILY_FLEET_REPORT_JOB_NAME,
        range.from,
        range.to,
      ),
      listIngestionEventsForRange(
        DAILY_FLEET_REPORT_JOB_NAME,
        range.from,
        range.to,
        date ? 50 : 200,
      ),
      listIngestionQueueForRange(
        DAILY_FLEET_REPORT_JOB_NAME,
        range.from,
        range.to,
      ),
    ]);

    const queueByDate = new Map(queue.map((item) => [item.report_date, item]));
    const vehiclesByDate = new Map<string, typeof vehicles>();
    for (const row of vehicles) {
      const list = vehiclesByDate.get(row.reportDate) ?? [];
      list.push(row);
      vehiclesByDate.set(row.reportDate, list);
    }

    const eventsByDate = new Map<string, typeof events>();
    for (const event of events) {
      const list = eventsByDate.get(event.report_date) ?? [];
      list.push(event);
      eventsByDate.set(event.report_date, list);
    }

    const targetDates = date ? [date] : range.dates;
    const days: CoverageDiagnosticsDay[] = targetDates.map((reportDate) => {
      const dayRows = vehiclesByDate.get(reportDate) ?? [];
      const dayVehicles = dayRows.map((row) => ({
        vehicleId: row.vehicleId,
        displayName: row.displayName,
        tractorNumber: row.tractorNumber,
        wialonUnitId: row.wialonUnitId,
        status: row.status,
        attempts: row.attempts,
        lastError: row.lastError,
        startedAt: row.startedAt,
        completedAt: row.completedAt,
      }));
      const failedVehicles = dayVehicles.filter(
        (vehicle) => vehicle.status === "failed",
      );
      const queueItem = queueByDate.get(reportDate);
      const retryExhausted =
        queueItem?.status === "failed" && queueItem.attempts >= 3;

      return {
        date: reportDate,
        runStatus: dayRows[0]?.runStatus ?? null,
        vehicles: dayVehicles,
        failedVehicles,
        retryExhausted,
        queueAttempts: queueItem?.attempts ?? 0,
        queueLastError: queueItem?.last_error ?? null,
        recentEvents: (eventsByDate.get(reportDate) ?? []).map((event) => ({
          id: event.id,
          scope: event.scope,
          eventType: event.event_type,
          attempt: event.attempt,
          status: event.status,
          message: event.message,
          vehicleId: event.vehicle_id,
          createdAt: event.created_at,
        })),
      };
    });

    const response: CoverageDiagnosticsResponse = {
      range: { from: range.from, to: range.to },
      days,
    };

    return NextResponse.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
