import { describe, expect, it, vi } from "vitest";
import { buildFleetCoverageDay } from "@/lib/report/build-fleet-coverage";
import {
  buildVehicleCoverageState,
  fleetKickShouldRun,
  fleetRetryPartialNeeded,
  hasClaimableQueuedDates,
  isFleetRunActivelyProcessing,
  isImportActive,
  isQueueItemClaimable,
  nextFleetPollDelayMs,
  resolveFleetImportKickAction,
  vehicleForceImportHasRemainingDates,
  vehicleImportNeedsPolling,
  vehicleImportShouldPoll,
} from "@/lib/report/coverage";
import type { CoverageDay } from "@/lib/report/types";

function day(
  partial: Partial<CoverageDay> & Pick<CoverageDay, "date" | "state">,
): CoverageDay {
  return {
    ready: partial.state === "ready",
    isToday: false,
    successfulVehicles: 0,
    failedVehicles: 0,
    expectedVehicles: 38,
    queueAttempts: 0,
    queueStatus: null,
    queueRunAfter: null,
    lastError: null,
    updatedAt: null,
    ...partial,
  };
}

describe("coverage helpers", () => {
  it("treats partial as active import but only kicks claimable queue", () => {
    const coverage = [
      day({ date: "2026-06-20", state: "partial" }),
      day({
        date: "2026-06-21",
        state: "queued",
        queueStatus: "pending",
        queueRunAfter: new Date(Date.now() + 60_000).toISOString(),
      }),
    ];
    expect(isImportActive(coverage)).toBe(true);
    expect(hasClaimableQueuedDates(coverage)).toBe(false);
    expect(fleetKickShouldRun(coverage)).toBe(false);
    expect(fleetRetryPartialNeeded(coverage)).toBe(false);
  });

  it("kicks when queue item is claimable", () => {
    const coverage = [
      day({
        date: "2026-06-21",
        state: "queued",
        queueStatus: "pending",
        queueRunAfter: new Date(Date.now() - 1_000).toISOString(),
      }),
    ];
    expect(hasClaimableQueuedDates(coverage)).toBe(true);
    expect(resolveFleetImportKickAction(coverage)).toEqual({ type: "kick" });
  });

  it("retries partial dates when queue is idle", () => {
    const coverage = [day({ date: "2026-06-20", state: "partial" })];
    expect(resolveFleetImportKickAction(coverage)).toEqual({
      type: "retry_partial",
    });
  });

  it("kicks claimable queue even when fleet run is still active", () => {
    const coverage = [
      day({ date: "2026-06-20", state: "running" }),
      day({
        date: "2026-06-21",
        state: "queued",
        queueStatus: "pending",
        queueRunAfter: new Date(Date.now() - 1_000).toISOString(),
      }),
    ];
    expect(fleetKickShouldRun(coverage)).toBe(true);
  });

  it("extends poll delay during queue backoff", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-23T10:00:00Z"));
    const coverage = [
      day({
        date: "2026-06-23",
        state: "partial",
        queueStatus: "pending",
        queueRunAfter: new Date(Date.now() + 45_000).toISOString(),
      }),
    ];
    expect(isQueueItemClaimable(coverage[0]!)).toBe(false);
    expect(nextFleetPollDelayMs(coverage)).toBe(45_000);
    vi.useRealTimers();
  });

  it("builds vehicle coverage for fleet-running date", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-23T10:00:00Z"));
    const result = buildVehicleCoverageState({
      date: "2026-06-20",
      today: "2026-06-23",
      hasTrip: false,
      hasIngestionRun: true,
      fleetRunIsFinal: false,
      fleetRunStatus: "running",
      fleetHeartbeatAt: new Date().toISOString(),
      vehicleRunStatus: null,
    });
    expect(result.state).toBe("running");
    expect(result.ready).toBe(false);
    vi.useRealTimers();
  });

  it("marks past date ready when vehicle ingest completed but fleet run is partial", () => {
    const result = buildVehicleCoverageState({
      date: "2026-06-29",
      today: "2026-06-30",
      hasTrip: true,
      hasIngestionRun: true,
      fleetRunIsFinal: false,
      fleetRunStatus: "partial",
      fleetHeartbeatAt: "2026-06-30T08:00:00Z",
      vehicleRunStatus: "completed",
    });
    expect(result).toEqual({ state: "ready", ready: true });
  });

  it("keeps legacy past trips ready without ingestion run", () => {
    const result = buildVehicleCoverageState({
      date: "2026-06-20",
      today: "2026-06-30",
      hasTrip: true,
      hasIngestionRun: false,
      fleetRunIsFinal: false,
      fleetRunStatus: null,
      fleetHeartbeatAt: null,
      vehicleRunStatus: null,
    });
    expect(result).toEqual({ state: "ready", ready: true });
  });

  it("marks today provisional when vehicle completed but fleet run not final", () => {
    const result = buildVehicleCoverageState({
      date: "2026-06-30",
      today: "2026-06-30",
      hasTrip: true,
      hasIngestionRun: true,
      fleetRunIsFinal: false,
      fleetRunStatus: "partial",
      fleetHeartbeatAt: "2026-06-30T08:00:00Z",
      vehicleRunStatus: "completed",
    });
    expect(result).toEqual({ state: "provisional", ready: true });
  });

  it("marks failed vehicle ingest on past date", () => {
    const result = buildVehicleCoverageState({
      date: "2026-06-29",
      today: "2026-06-30",
      hasTrip: false,
      hasIngestionRun: true,
      fleetRunIsFinal: false,
      fleetRunStatus: "partial",
      fleetHeartbeatAt: "2026-06-30T08:00:00Z",
      vehicleRunStatus: "failed",
    });
    expect(result).toEqual({ state: "failed", ready: false });
  });

  it("detects stale fleet runs as not actively processing", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-23T10:00:00Z"));
    const staleHeartbeat = new Date(Date.now() - 20 * 60_000).toISOString();
    expect(
      isFleetRunActivelyProcessing({
        status: "running",
        heartbeatAt: staleHeartbeat,
      }),
    ).toBe(false);
    vi.useRealTimers();
  });

  it("keeps vehicle import polling active until report is ready", () => {
    const coverage = [
      day({ date: "2026-06-24", state: "ready", ready: true }),
      day({ date: "2026-06-25", state: "missing" }),
    ];
    expect(vehicleImportNeedsPolling(coverage, false, true)).toBe(true);
    expect(vehicleImportNeedsPolling(coverage, false, false)).toBe(false);
    expect(vehicleImportNeedsPolling(coverage, true, true)).toBe(false);
  });

  it("detects remaining dates for force import after a processed day", () => {
    const coverage = [
      day({ date: "2026-06-24", state: "ready", ready: true }),
      day({ date: "2026-06-25", state: "ready", ready: true }),
      day({ date: "2026-06-26", state: "ready", ready: true }),
    ];
    expect(
      vehicleForceImportHasRemainingDates({
        coverage,
        afterDate: null,
      }),
    ).toBe(true);
    expect(
      vehicleForceImportHasRemainingDates({
        coverage,
        afterDate: "2026-06-24",
      }),
    ).toBe(true);
    expect(
      vehicleForceImportHasRemainingDates({
        coverage,
        afterDate: "2026-06-26",
      }),
    ).toBe(false);
  });

  it("keeps force import polling active when report is already ready", () => {
    const coverage = [
      day({ date: "2026-06-24", state: "ready", ready: true }),
      day({ date: "2026-06-25", state: "ready", ready: true }),
    ];
    expect(
      vehicleImportShouldPoll({
        coverage,
        ready: true,
        importActive: true,
        mode: "force",
        afterDate: null,
        forceAwaitingIdle: true,
      }),
    ).toBe(true);
    expect(
      vehicleImportShouldPoll({
        coverage,
        ready: true,
        importActive: true,
        mode: "force",
        afterDate: "2026-06-25",
        forceAwaitingIdle: true,
      }),
    ).toBe(true);
    expect(
      vehicleImportShouldPoll({
        coverage,
        ready: true,
        importActive: true,
        mode: "missing",
        afterDate: null,
        forceAwaitingIdle: false,
      }),
    ).toBe(false);
  });
});

describe("buildFleetCoverageDay", () => {
  it("prefers partial run state over pending queue", () => {
    const result = buildFleetCoverageDay({
      date: "2026-06-23",
      isToday: false,
      run: {
        id: "run-1",
        job_name: "daily-fleet-report",
        report_date: "2026-06-23",
        status: "partial",
        expected_vehicles: 24,
        successful_vehicles: 23,
        failed_vehicles: 1,
        started_at: "2026-06-23T08:00:00Z",
        heartbeat_at: "2026-06-23T08:10:00Z",
        completed_at: "2026-06-23T08:10:00Z",
        is_final: false,
        last_successful_at: null,
        finalized_at: null,
        error_summary: [],
        metadata: {},
      },
      queueItem: {
        id: "queue-1",
        job_name: "daily-fleet-report",
        report_date: "2026-06-23",
        mode: "retry_failed",
        status: "pending",
        attempts: 1,
        run_after: "2026-06-23T08:15:00Z",
        locked_at: null,
        lock_token: null,
        completed_at: null,
        last_error: "partial",
        created_at: "2026-06-23T08:00:00Z",
        updated_at: "2026-06-23T08:10:00Z",
      },
    });

    expect(result.state).toBe("partial");
    expect(result.queueStatus).toBe("pending");
    expect(result.queueRunAfter).toBe("2026-06-23T08:15:00Z");
  });
});
