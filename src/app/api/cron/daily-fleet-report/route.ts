import { NextRequest, NextResponse } from "next/server";
import { getServerEnv, requireCronSecret } from "@/config/env";
import { runDailyFleetReport } from "@/jobs/run-daily-fleet-report";
import { isAuthorizedCronRequest } from "@/utils/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  try {
    const cronSecret = requireCronSecret();
    const authorized = isAuthorizedCronRequest(
      request.headers.get("authorization"),
      cronSecret,
    );
    if (!authorized) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const env = getServerEnv();
    const result = await runDailyFleetReport({
      sendTelegram: true,
      softDeadlineMs: env.JOB_SOFT_DEADLINE_MS ?? 270_000,
    });

    return NextResponse.json({
      ok: result.status !== "failed",
      status: result.status,
      reportDate: result.reportDate,
      reason: result.reason,
      processed: result.summary?.processed,
      expected: result.summary?.expected,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
