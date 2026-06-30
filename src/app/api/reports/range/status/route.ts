import { NextRequest, NextResponse } from "next/server";
import { getServerEnv } from "@/config/env";
import { listIngestionQueueForRange } from "@/db/ingestion-queue-repository";
import { listIngestionRunsForRange } from "@/db/ingestion-runs-repository";
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
    const readyDates = coverage.filter((day) => day.ready).length;
    const partialReady = readyDates > 0 && !ready;

    return NextResponse.json({
      range: { from: range.from, to: range.to, today: range.today },
      ready,
      partialReady,
      coverage,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
