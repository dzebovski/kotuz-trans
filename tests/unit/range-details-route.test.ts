import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth/require-user", () => ({
  requireUser: vi.fn(),
}));
vi.mock("@/config/env", () => ({
  getServerEnv: vi.fn(() => ({ BUSINESS_TIMEZONE: "Europe/Kyiv" })),
}));
vi.mock("@/db/trips-repository", () => ({
  listFuelDrainsForVehicleRange: vi.fn(),
  listFuelRefillsForVehicleRange: vi.fn(),
  listTripSegmentsForDailyTrip: vi.fn(),
  listTripSegmentsForVehicleRange: vi.fn(),
}));

import { GET } from "@/app/api/reports/range/details/route";
import {
  listFuelDrainsForVehicleRange,
  listFuelRefillsForVehicleRange,
  listTripSegmentsForVehicleRange,
} from "@/db/trips-repository";
import { requireUser } from "@/lib/auth/require-user";

function request(params: string): NextRequest {
  return new NextRequest(`http://localhost/api/reports/range/details?${params}`);
}

describe("range details GET route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-23T10:00:00Z"));
    vi.mocked(requireUser).mockResolvedValue({ id: "user-1" } as never);
    vi.mocked(listTripSegmentsForVehicleRange).mockResolvedValue([]);
    vi.mocked(listFuelRefillsForVehicleRange).mockResolvedValue([]);
    vi.mocked(listFuelDrainsForVehicleRange).mockResolvedValue([]);
  });

  it("returns segments, refills and drains for a selected vehicle and range", async () => {
    vi.mocked(listTripSegmentsForVehicleRange).mockResolvedValue([
      {
        id: "segment-1",
        dailyTripId: "trip-1",
        reportDate: "2026-06-22",
        startedAt: "2026-06-22T08:00:00Z",
        endedAt: "2026-06-22T09:00:00Z",
        durationSeconds: 3600,
        mileageKm: 80,
        fuelConsumedL: 20,
        averageFuelConsumptionLPer100Km: 25,
        averageSpeedKmh: 80,
        maxSpeedKmh: 92,
        startLatitude: null,
        startLongitude: null,
        startAddress: "Kyiv",
        endLatitude: null,
        endLongitude: null,
        endAddress: "Zhytomyr",
        isLocalManeuver: false,
      },
    ]);
    vi.mocked(listFuelRefillsForVehicleRange).mockResolvedValue([
      {
        id: "refill-1",
        dailyTripId: "trip-1",
        reportDate: "2026-06-22",
        eventTime: "2026-06-22T10:00:00Z",
        volumeL: 120,
        latitude: 50.45,
        longitude: 30.52,
        address: "Fuel station",
      },
    ]);
    vi.mocked(listFuelDrainsForVehicleRange).mockResolvedValue([
      {
        id: "drain-1",
        dailyTripId: "trip-1",
        reportDate: "2026-06-22",
        eventTime: "2026-06-22T11:00:00Z",
        volumeL: 45,
        latitude: 50.1,
        longitude: 30.1,
        address: "Parking lot",
      },
    ]);

    const response = await GET(
      request("vehicleId=vehicle-1&from=2026-06-22&to=2026-06-22"),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.segments).toHaveLength(1);
    expect(json.refills).toHaveLength(1);
    expect(json.drains).toHaveLength(1);
    expect(listTripSegmentsForVehicleRange).toHaveBeenCalledWith({
      vehicleId: "vehicle-1",
      from: "2026-06-22",
      to: "2026-06-22",
    });
    expect(listFuelRefillsForVehicleRange).toHaveBeenCalledWith({
      vehicleId: "vehicle-1",
      from: "2026-06-22",
      to: "2026-06-22",
    });
    expect(listFuelDrainsForVehicleRange).toHaveBeenCalledWith({
      vehicleId: "vehicle-1",
      from: "2026-06-22",
      to: "2026-06-22",
    });
  });

  it("rejects missing range parameters", async () => {
    const response = await GET(request("vehicleId=vehicle-1"));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toBe("vehicleId, from and to are required");
  });
});
