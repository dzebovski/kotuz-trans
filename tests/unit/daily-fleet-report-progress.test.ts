import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/config/env", () => ({
  getServerEnv: vi.fn(() => ({
    BUSINESS_TIMEZONE: "Europe/Kyiv",
    WIALON_CONCURRENCY: 2,
  })),
}));

vi.mock("@/db/ingestion-runs-repository", () => ({
  acquireIngestionLock: vi.fn(),
  ensureIngestionVehicleSnapshot: vi.fn(),
  finalizeIngestionRun: vi.fn(),
  getIngestionVehicleCounts: vi.fn(),
  markIngestionVehicleResult: vi.fn(),
  markIngestionVehiclesRunning: vi.fn(),
  updateIngestionProgress: vi.fn(),
}));

vi.mock("@/db/vehicles-repository", () => ({
  listActiveVehicles: vi.fn(),
  listVehiclesByIds: vi.fn(),
}));

vi.mock("@/jobs/process-vehicle", () => ({
  processVehicle: vi.fn(),
}));

vi.mock("@/jobs/recalculate-derived-metrics", () => ({
  recalculateVehicleDerivedMetricsAfterDate: vi.fn(),
}));

vi.mock("@/telegram/client", () => ({
  sendFleetReport: vi.fn(),
}));

import {
  acquireIngestionLock,
  ensureIngestionVehicleSnapshot,
  finalizeIngestionRun,
  getIngestionVehicleCounts,
  markIngestionVehicleResult,
  markIngestionVehiclesRunning,
  updateIngestionProgress,
} from "@/db/ingestion-runs-repository";
import {
  listActiveVehicles,
  listVehiclesByIds,
  type VehicleRecord,
} from "@/db/vehicles-repository";
import { processVehicle } from "@/jobs/process-vehicle";
import { runDailyFleetReport } from "@/jobs/run-daily-fleet-report";

const vehicles = [
  {
    id: "vehicle-1",
    wialon_unit_id: 101,
    display_name: "Truck 101",
    tractor_number: "101",
    trailer_number: null,
    consumption_tier: null,
    is_active: true,
  },
  {
    id: "vehicle-2",
    wialon_unit_id: 102,
    display_name: "Truck 102",
    tractor_number: "102",
    trailer_number: null,
    consumption_tier: null,
    is_active: true,
  },
  {
    id: "vehicle-3",
    wialon_unit_id: 103,
    display_name: "Truck 103",
    tractor_number: "103",
    trailer_number: null,
    consumption_tier: null,
    is_active: true,
  },
];

function successfulResult(vehicle: VehicleRecord) {
  return {
    success: true,
    vehicle,
    warnings: [],
    summary: {
      displayName: vehicle.display_name,
      tractorNumber: vehicle.tractor_number,
      mileageKm: 100,
      fuelConsumedL: 30,
      averageFuelConsumptionLPer100Km: 30,
      deviationPercent: null,
      baselineAverageLPer100Km: null,
      anomalyStatus: "normal",
      routeKey: null,
      highwayRatio: null,
      firstTripAt: null,
      lastTripAt: null,
      refillCount: 0,
      refilledL: 0,
      drainCount: 0,
    },
  };
}

describe("daily fleet report progress", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listActiveVehicles).mockResolvedValue(vehicles);
    vi.mocked(listVehiclesByIds).mockResolvedValue(vehicles);
    vi.mocked(acquireIngestionLock).mockResolvedValue({
      action: "start",
      run: {
        id: "run-1",
        job_name: "daily-fleet-report",
        report_date: "2026-06-14",
        status: "running",
        expected_vehicles: 3,
        successful_vehicles: 0,
        failed_vehicles: 0,
        started_at: "2026-06-15T04:00:00.000Z",
        heartbeat_at: "2026-06-15T04:00:00.000Z",
        completed_at: null,
        is_final: false,
        last_successful_at: null,
        finalized_at: null,
        error_summary: [],
        metadata: {},
      },
    });
    vi.mocked(ensureIngestionVehicleSnapshot).mockResolvedValue(
      vehicles.map((vehicle) => ({
        run_id: "run-1",
        vehicle_id: vehicle.id,
        status: "pending",
        attempts: 0,
        last_error: null,
        started_at: null,
        completed_at: null,
      })),
    );
    vi.mocked(getIngestionVehicleCounts).mockResolvedValue({
      expected: 3,
      successful: 2,
      failed: 1,
      pending: 0,
    });
    vi.mocked(processVehicle).mockImplementation(async ({ vehicle }) => {
      if (vehicle.wialon_unit_id === 102) {
        return {
          success: false,
          vehicle,
          warnings: [],
          error: "Wialon timeout",
        };
      }
      return successfulResult(vehicle);
    });
  });

  it("publishes current batch and counters after every batch", async () => {
    const result = await runDailyFleetReport({
      reportDate: "2026-06-14",
      sendTelegram: false,
      softDeadlineMs: null,
    });

    expect(result.status).toBe("partial");
    expect(updateIngestionProgress).toHaveBeenNthCalledWith(1, {
      runId: "run-1",
      successfulVehicles: 0,
      failedVehicles: 0,
      phase: "processing",
      currentVehicles: [
        { wialonUnitId: 101, displayName: "Truck 101" },
        { wialonUnitId: 102, displayName: "Truck 102" },
      ],
    });
    expect(updateIngestionProgress).toHaveBeenNthCalledWith(2, {
      runId: "run-1",
      successfulVehicles: 1,
      failedVehicles: 1,
      phase: "processing",
      currentVehicles: [],
    });
    expect(updateIngestionProgress).toHaveBeenNthCalledWith(3, {
      runId: "run-1",
      successfulVehicles: 1,
      failedVehicles: 1,
      phase: "processing",
      currentVehicles: [
        { wialonUnitId: 103, displayName: "Truck 103" },
      ],
    });
    expect(updateIngestionProgress).toHaveBeenNthCalledWith(4, {
      runId: "run-1",
      successfulVehicles: 2,
      failedVehicles: 1,
      phase: "processing",
      currentVehicles: [],
    });
    expect(updateIngestionProgress).toHaveBeenNthCalledWith(5, {
      runId: "run-1",
      successfulVehicles: 2,
      failedVehicles: 1,
      phase: "finalizing",
      currentVehicles: [],
    });
    expect(finalizeIngestionRun).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "run-1",
        status: "partial",
        successfulVehicles: 2,
        failedVehicles: 1,
      }),
    );
    expect(markIngestionVehiclesRunning).toHaveBeenCalledTimes(2);
    expect(markIngestionVehicleResult).toHaveBeenCalledTimes(3);
  });

  it("leaves pending vehicles when chunk deadline hits", async () => {
    vi.mocked(processVehicle).mockImplementation(async ({ vehicle }) => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return successfulResult(vehicle);
    });
    vi.mocked(getIngestionVehicleCounts).mockResolvedValue({
      expected: 3,
      successful: 2,
      failed: 0,
      pending: 1,
    });

    const result = await runDailyFleetReport({
      reportDate: "2026-06-14",
      sendTelegram: false,
      softDeadlineMs: 1,
    });

    expect(result.deadlineHit).toBe(true);
    expect(result.pendingVehicles).toBe(1);
    expect(finalizeIngestionRun).not.toHaveBeenCalled();
    expect(
      vi.mocked(markIngestionVehicleResult).mock.calls.some(
        ([input]) => input.error === "deadline",
      ),
    ).toBe(false);
  });
});
