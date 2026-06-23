import { NextRequest, NextResponse } from "next/server";
import { inferPausesBetweenSegments } from "@/analytics/inferred-pauses";
import { listTripSegmentsForDailyTrip } from "@/db/trips-repository";
import { requireUser } from "@/lib/auth/require-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await requireUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const dailyTripId = request.nextUrl.searchParams.get("dailyTripId");
    if (!dailyTripId) {
      return NextResponse.json(
        { error: "dailyTripId is required" },
        { status: 400 },
      );
    }
    const segments = await listTripSegmentsForDailyTrip(dailyTripId);
    return NextResponse.json({
      segments,
      derivedPauses: inferPausesBetweenSegments(segments),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

