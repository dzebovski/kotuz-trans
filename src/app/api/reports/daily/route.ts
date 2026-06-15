import { NextRequest, NextResponse } from "next/server";
import { listDailyTripsForReportDate } from "@/db/trips-repository";
import { getPreviousBusinessDay } from "@/utils/time";
import { getServerEnv } from "@/config/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const env = getServerEnv();
    const date =
      request.nextUrl.searchParams.get("date") ??
      getPreviousBusinessDay(env.BUSINESS_TIMEZONE);

    const trips = await listDailyTripsForReportDate(date);
    const summary = {
      reportDate: date,
      vehicleCount: trips.length,
      totalMileageKm: trips.reduce((sum, trip) => sum + trip.mileage_km, 0),
      totalFuelL: trips.reduce(
        (sum, trip) => sum + (trip.fuel_consumed_l ?? 0),
        0,
      ),
      withRoute: trips.filter((trip) => trip.route_key).length,
      withSegments: trips.filter((trip) => trip.segments.length > 0).length,
    };

    return NextResponse.json({ summary, trips });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
