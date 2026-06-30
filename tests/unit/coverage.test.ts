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
      tripIsFinal: false,
      fleetRunStatus: "running",
      fleetHeartbeatAt: new Date().toISOString(),
      vehicleRunStatus: null,
    });
    expect(result.state).toBe("running");
    expect(result.ready).toBe(false);
    vi.useRealTimers();
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
