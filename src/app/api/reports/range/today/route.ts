import { NextResponse } from "next/server";
import { DateTime } from "luxon";
import { getServerEnv } from "@/config/env";
import { enqueueIngestionDate } from "@/db/ingestion-queue-repository";
import { DAILY_FLEET_REPORT_JOB_NAME } from "@/jobs/run-daily-fleet-report";
import { requireUser } from "@/lib/auth/require-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(): Promise<NextResponse> {
  try {
    const user = await requireUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const env = getServerEnv();
    const today = DateTime.now()
      .setZone(env.BUSINESS_TIMEZONE)
      .toISODate()!;
    await enqueueIngestionDate({
      jobName: DAILY_FLEET_REPORT_JOB_NAME,
      reportDate: today,
      mode: "full_refresh",
      resetAttempts: true,
    });
    return NextResponse.json({ ok: true, reportDate: today });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

