import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth/require-user", () => ({
  requireUser: vi.fn(),
}));
vi.mock("@/config/env", () => ({
  getServerEnv: vi.fn(() => ({ BUSINESS_TIMEZONE: "Europe/Kyiv" })),
}));
vi.mock("@/db/vehicles-repository", () => ({
  getVehicleById: vi.fn(),
}));
vi.mock("@/db/trips-repository", () => ({
  listDailyTripsForVehicleInRange: vi.fn(),
}));
vi.mock("@/db/ingestion-runs-repository", () => ({
  listVehicleIngestionStatusForRange: vi.fn(),
}));

import { GET } from "@/app/api/vehicles/[vehicleId]/report/route";
import { listVehicleIngestionStatusForRange } from "@/db/ingestion-runs-repository";
import { listDailyTripsForVehicleInRange } from "@/db/trips-repository";
import { getVehicleById } from "@/db/vehicles-repository";
import { requireUser } from "@/lib/auth/require-user";

function request(vehicleId: string, from: string, to: string): NextRequest {
  return new NextRequest(
    `http://localhost/api/vehicles/${vehicleId}/report?from=${from}&to=${to}`,
  );
}

describe("vehicle report GET route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-23T10:00:00Z"));
    vi.mocked(requireUser).mockResolvedValue({ id: "user-1" } as never);
    vi.mocked(getVehicleById).mockResolvedValue({
      id: "vehicle-1",
      wialon_unit_id: 101,
      display_name: "AC2096HI",
      tractor_number: "AC2096HI",
      trailer_number: null,
      consumption_tier: 32,
      is_active: true,
    });
    vi.mocked(listVehicleIngestionStatusForRange).mockResolvedValue([]);
  });

  it("returns partialReady with vehicle aggregate for ready dates only", async () => {
    vi.mocked(listDailyTripsForVehicleInRange).mockResolvedValue([
      {
        id: "trip-1",
        reportDate: "2026-06-22",
        mileageKm: 120,
        fuelConsumedL: 30,
        averageFuelConsumptionLPer100Km: 25,
        rolling1000KmConsumptionLPer100Km: 24,
        movementDurationSeconds: 3600,
        averageSpeedKmh: 60,
        parkingCount: 1,
        parkingDurationSeconds: 600,
        maxSpeedKmh: 80,
        refillCount: 0,
        refilledL: 0,
        fuelStatus: "normal",
        routeKey: "ua",
        vehicle: {
          id: "vehicle-1",
          displayName: "AC2096HI",
          tractorNumber: "AC2096HI",
          wialonUnitId: 101,
          consumptionTier: 32,
        },
      },
    ]);

    const response = await GET(request("vehicle-1", "2026-06-22", "2026-06-23"), {
      params: Promise.resolve({ vehicleId: "vehicle-1" }),
    });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.partialReady).toBe(true);
    expect(json.ready).toBe(false);
    expect(json.vehicle?.mileageKm).toBe(120);
    expect(json.coverage).toHaveLength(2);
    expect(json.coverage[0].expectedVehicles).toBe(1);
  });
});
