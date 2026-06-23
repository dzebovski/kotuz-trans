import { NextRequest, NextResponse } from "next/server";
import { getServerEnv } from "@/config/env";
import {
  enqueueIngestionDate,
  listIngestionQueueForRange,
} from "@/db/ingestion-queue-repository";
import { listIngestionRunsForRange } from "@/db/ingestion-runs-repository";
import { DAILY_FLEET_REPORT_JOB_NAME } from "@/jobs/run-daily-fleet-report";
import { requireUser } from "@/lib/auth/require-user";
import { validateReportRange } from "@/utils/report-range";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await requireUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = (await request.json()) as {
      from?: unknown;
      to?: unknown;
      mode?: unknown;
      retryFailed?: unknown;
    };
    if (
      typeof body.from !== "string" ||
      typeof body.to !== "string" ||
      (body.mode !== "missing" && body.mode !== "force") ||
      (body.retryFailed != null && typeof body.retryFailed !== "boolean")
    ) {
      return NextResponse.json(
        {
          error:
            "Expected { from: YYYY-MM-DD, to: YYYY-MM-DD, mode: missing|force }",
        },
        { status: 400 },
      );
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
    const queued: string[] = [];
    const skipped: string[] = [];

    for (const date of range.dates) {
      if (date === range.today) {
        skipped.push(date);
        continue;
      }
      const run = runByDate.get(date);
      const queueItem = queueByDate.get(date);
      if (body.mode === "missing" && run?.status === "completed" && run.is_final) {
        skipped.push(date);
        continue;
      }
      if (
        body.mode === "missing" &&
        (run?.status === "running" ||
          queueItem?.status === "running" ||
          queueItem?.status === "pending")
      ) {
        skipped.push(date);
        continue;
      }
      if (
        body.mode === "missing" &&
        queueItem?.status === "failed" &&
        body.retryFailed !== true
      ) {
        skipped.push(date);
        continue;
      }

      const mode =
        body.mode === "force" || (run?.status === "completed" && !run.is_final)
          ? "full_refresh"
          : run?.status === "partial" || run?.status === "failed"
            ? "retry_failed"
            : "missing";
      await enqueueIngestionDate({
        jobName: DAILY_FLEET_REPORT_JOB_NAME,
        reportDate: date,
        mode,
        resetAttempts: body.retryFailed === true || body.mode === "force",
      });
      queued.push(date);
    }

    return NextResponse.json({ ok: true, queued, skipped });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

