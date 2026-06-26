import { NextRequest, NextResponse } from "next/server";
import { inferPausesBetweenSegments } from "@/analytics/inferred-pauses";
import { getServerEnv } from "@/config/env";
import {
  listFuelRefillsForVehicleRange,
  listTripSegmentsForDailyTrip,
  listTripSegmentsForVehicleRange,
} from "@/db/trips-repository";
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
    const dailyTripId = request.nextUrl.searchParams.get("dailyTripId");
    if (dailyTripId) {
      const segments = await listTripSegmentsForDailyTrip(dailyTripId);
      return NextResponse.json({
        segments,
        derivedPauses: inferPausesBetweenSegments(segments),
      });
    }

    const vehicleId = request.nextUrl.searchParams.get("vehicleId");
    const from = request.nextUrl.searchParams.get("from");
    const to = request.nextUrl.searchParams.get("to");
    if (!vehicleId || !from || !to) {
      return NextResponse.json(
        { error: "vehicleId, from and to are required" },
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

    const [segments, refills] = await Promise.all([
      listTripSegmentsForVehicleRange({
        vehicleId,
        from: range.from,
        to: range.to,
      }),
      listFuelRefillsForVehicleRange({
        vehicleId,
        from: range.from,
        to: range.to,
      }),
    ]);

    return NextResponse.json({ segments, refills });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
