import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth/require-user", () => ({
  requireUser: vi.fn(),
}));
vi.mock("@/config/env", () => ({
  getServerEnv: vi.fn(() => ({ BUSINESS_TIMEZONE: "Europe/Kyiv" })),
}));
vi.mock("@/jobs/ingestion-queue-worker", () => ({
  enqueueMissingDatesForRange: vi.fn(),
}));

import { GET } from "@/app/api/reports/range/route";
import { enqueueMissingDatesForRange } from "@/jobs/ingestion-queue-worker";
import { requireUser } from "@/lib/auth/require-user";

vi.mock("@/db/ingestion-runs-repository", () => ({
  listIngestionRunsForRange: vi.fn(),
}));
vi.mock("@/db/ingestion-queue-repository", () => ({
  listIngestionQueueForRange: vi.fn(),
}));
vi.mock("@/db/trips-repository", () => ({
  listDailyTripsForDates: vi.fn(),
}));

import { listIngestionQueueForRange } from "@/db/ingestion-queue-repository";
import { listIngestionRunsForRange } from "@/db/ingestion-runs-repository";
import { listDailyTripsForDates } from "@/db/trips-repository";

function request(from: string, to: string): NextRequest {
  return new NextRequest(
    `http://localhost/api/reports/range?from=${from}&to=${to}`,
  );
}

describe("range GET route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-23T10:00:00Z"));
    vi.mocked(requireUser).mockResolvedValue({ id: "user-1" } as never);
    vi.mocked(listIngestionQueueForRange).mockResolvedValue([]);
    vi.mocked(listDailyTripsForDates).mockResolvedValue([]);
  });

  it("returns partialReady with vehicles for ready dates only", async () => {
    vi.mocked(listIngestionRunsForRange).mockResolvedValue([
      {
        id: "run-1",
        job_name: "daily-fleet-report",
        report_date: "2026-06-22",
        status: "completed",
        expected_vehicles: 1,
        successful_vehicles: 1,
        failed_vehicles: 0,
        started_at: "2026-06-23T04:00:00Z",
        heartbeat_at: "2026-06-23T04:02:00Z",
        completed_at: "2026-06-23T04:02:00Z",
        is_final: true,
        last_successful_at: "2026-06-23T04:02:00Z",
        finalized_at: "2026-06-23T04:02:00Z",
        error_summary: [],
        metadata: {},
      },
    ]);
    vi.mocked(listDailyTripsForDates).mockResolvedValue([
      {
        id: "trip-1",
        reportDate: "2026-06-22",
        mileageKm: 120,
        fuelConsumedL: 30,
        averageFuelConsumptionLPer100Km: 25,
        rolling1000KmConsumptionLPer100Km: 24,
        movementDurationSeconds: 3600,
        averageSpeedKmh: 120,
        parkingCount: 1,
        parkingDurationSeconds: 600,
        maxSpeedKmh: 80,
        refillCount: 3,
        refilledL: 245,
        fuelStatus: "normal",
        routeKey: null,
        vehicle: {
          id: "vehicle-1",
          displayName: "AA1234",
          tractorNumber: "AA1234",
          wialonUnitId: 1,
          consumptionTier: 30,
        },
      },
    ]);

    const response = await GET(request("2026-06-21", "2026-06-22"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ready).toBe(false);
    expect(json.partialReady).toBe(true);
    expect(json.vehicles).toHaveLength(1);
    expect(json.vehicles[0].refillCount).toBe(3);
    expect(json.vehicles[0].refilledL).toBe(245);
    expect(json.vehicles[0].averageSpeedKmh).toBe(120);
    expect(listDailyTripsForDates).toHaveBeenCalledWith(["2026-06-22"]);
    expect(enqueueMissingDatesForRange).not.toHaveBeenCalled();
  });
});
