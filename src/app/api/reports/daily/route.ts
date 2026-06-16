import { NextRequest, NextResponse } from "next/server";
import { inferPausesBetweenSegments } from "@/analytics/inferred-pauses";
import { requireUser } from "@/lib/auth/require-user";
import { listDailyTripsForReportDate } from "@/db/trips-repository";
import { getPreviousBusinessDay } from "@/utils/time";
import { getServerEnv } from "@/config/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SPEED_LIMIT_KMH = 86;

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await requireUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const env = getServerEnv();
    const date =
      request.nextUrl.searchParams.get("date") ??
      getPreviousBusinessDay(env.BUSINESS_TIMEZONE);

    const trips = await listDailyTripsForReportDate(date);
    const rollingConsumptions = trips
      .map((trip) => trip.rolling_1000km_consumption_l_per_100km)
      .filter((value): value is number => value != null);

    const summary = {
      reportDate: date,
      vehicleCount: trips.length,
      totalMileageKm: trips.reduce((sum, trip) => sum + trip.mileage_km, 0),
      totalFuelL: trips.reduce(
        (sum, trip) => sum + (trip.fuel_consumed_l ?? 0),
        0,
      ),
      totalMovementSeconds: trips.reduce(
        (sum, trip) => sum + (trip.movement_duration_seconds ?? 0),
        0,
      ),
      totalParkingCount: trips.reduce(
        (sum, trip) => sum + trip.parking_count_from_trips,
        0,
      ),
      totalParkingSeconds: trips.reduce(
        (sum, trip) => sum + (trip.parking_duration_seconds ?? 0),
        0,
      ),
      vehiclesOverSpeedLimit: trips.filter(
        (trip) => (trip.max_speed_kmh ?? 0) > SPEED_LIMIT_KMH,
      ).length,
      averageRollingConsumptionLPer100Km:
        rollingConsumptions.length > 0
          ? rollingConsumptions.reduce((sum, value) => sum + value, 0) /
            rollingConsumptions.length
          : null,
      withRoute: trips.filter((trip) => trip.route_key).length,
      withSegments: trips.filter((trip) => trip.segments.length > 0).length,
    };

    const tripsWithPauses = trips.map((trip) => ({
      ...trip,
      speedLimitExceeded: (trip.max_speed_kmh ?? 0) > SPEED_LIMIT_KMH,
      derivedPauses: inferPausesBetweenSegments(trip.segments),
    }));

    return NextResponse.json({ summary, trips: tripsWithPauses });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
