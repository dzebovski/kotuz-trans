import { NextRequest, NextResponse } from "next/server";
import { getServerEnv } from "@/config/env";
import { processNextIngestionQueueItem } from "@/jobs/ingestion-queue-worker";
import { requireUser } from "@/lib/auth/require-user";
import { validateReportRange } from "@/utils/report-range";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await requireUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as {
      from?: unknown;
      to?: unknown;
    };
    if (typeof body.from !== "string" || typeof body.to !== "string") {
      return NextResponse.json(
        { error: "Expected { from: YYYY-MM-DD, to: YYYY-MM-DD }" },
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

    const chunkMs = env.RANGE_RUN_CHUNK_MS ?? 45_000;
    const result = await processNextIngestionQueueItem({
      from: range.from,
      to: range.to,
      softDeadlineMs: chunkMs,
    });

    return NextResponse.json({
      ok:
        result.status === "completed" ||
        result.status === "skipped" ||
        result.status === "idle" ||
        result.status === "running",
      ...result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
