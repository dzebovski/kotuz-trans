import { NextRequest, NextResponse } from "next/server";
import { getServerEnv } from "@/config/env";
import { enqueueMissingDatesForRange } from "@/jobs/ingestion-queue-worker";
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

    const { queued, skipped } = await enqueueMissingDatesForRange({
      from: range.from,
      to: range.to,
      dates: range.dates,
      today: range.today,
      mode: body.mode,
      retryFailed: body.retryFailed === true,
    });

    return NextResponse.json({ ok: true, queued, skipped });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
