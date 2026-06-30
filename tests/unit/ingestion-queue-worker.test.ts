import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/config/env", () => ({
  getServerEnv: vi.fn(() => ({
    BUSINESS_TIMEZONE: "Europe/Kyiv",
    JOB_SOFT_DEADLINE_MS: 270_000,
  })),
}));
vi.mock("@/db/ingestion-runs-repository", () => ({
  listIngestionRunsForRange: vi.fn(),
}));
vi.mock("@/db/ingestion-queue-repository", () => ({
  enqueueIngestionDate: vi.fn(),
  listIngestionQueueForRange: vi.fn(),
  claimNextIngestionDate: vi.fn(),
  completeIngestionQueueItem: vi.fn(),
  failIngestionQueueItem: vi.fn(),
  releaseIngestionQueueClaim: vi.fn(),
  inspectIngestionQueueForRange: vi.fn(),
  resolveQueueIdleReason: vi.fn(),
}));
vi.mock("@/jobs/run-daily-fleet-report", () => ({
  DAILY_FLEET_REPORT_JOB_NAME: "daily-fleet-report",
  runDailyFleetReport: vi.fn(),
}));

import {
  claimNextIngestionDate,
  completeIngestionQueueItem,
  enqueueIngestionDate,
  failIngestionQueueItem,
  inspectIngestionQueueForRange,
  listIngestionQueueForRange,
  releaseIngestionQueueClaim,
  resolveQueueIdleReason,
} from "@/db/ingestion-queue-repository";
import { listIngestionRunsForRange } from "@/db/ingestion-runs-repository";
import {
  enqueueMissingDatesForRange,
  processNextIngestionQueueItem,
} from "@/jobs/ingestion-queue-worker";
import { runDailyFleetReport } from "@/jobs/run-daily-fleet-report";

describe("enqueueMissingDatesForRange", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listIngestionRunsForRange).mockResolvedValue([]);
    vi.mocked(listIngestionQueueForRange).mockResolvedValue([]);
    vi.mocked(enqueueIngestionDate).mockResolvedValue({} as never);
  });

  it("skips completed final past dates in missing mode", async () => {
    vi.mocked(listIngestionRunsForRange).mockResolvedValue([
      {
        id: "run-1",
        job_name: "daily-fleet-report",
        report_date: "2026-06-22",
        status: "completed",
        expected_vehicles: 3,
        successful_vehicles: 3,
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

    const result = await enqueueMissingDatesForRange({
      from: "2026-06-22",
      to: "2026-06-22",
      dates: ["2026-06-22"],
      today: "2026-06-23",
      mode: "missing",
    });

    expect(result.skipped).toEqual(["2026-06-22"]);
    expect(enqueueIngestionDate).not.toHaveBeenCalled();
  });

  it("enqueues today in range as full refresh", async () => {
    await enqueueMissingDatesForRange({
      from: "2026-06-23",
      to: "2026-06-23",
      dates: ["2026-06-23"],
      today: "2026-06-23",
      mode: "missing",
    });

    expect(enqueueIngestionDate).toHaveBeenCalledWith(
      expect.objectContaining({
        reportDate: "2026-06-23",
        mode: "full_refresh",
      }),
    );
  });

  it("retries failed and enqueues missing dates without reloading completed dates", async () => {
    vi.mocked(listIngestionRunsForRange).mockResolvedValue([
      {
        id: "run-completed",
        job_name: "daily-fleet-report",
        report_date: "2026-06-20",
        status: "completed",
        expected_vehicles: 3,
        successful_vehicles: 3,
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
      {
        id: "run-failed",
        job_name: "daily-fleet-report",
        report_date: "2026-06-21",
        status: "failed",
        expected_vehicles: 3,
        successful_vehicles: 1,
        failed_vehicles: 2,
        started_at: "2026-06-23T04:00:00Z",
        heartbeat_at: "2026-06-23T04:02:00Z",
        completed_at: "2026-06-23T04:02:00Z",
        is_final: false,
        last_successful_at: null,
        finalized_at: null,
        error_summary: ["timeout"],
        metadata: {},
      },
    ]);

    const result = await enqueueMissingDatesForRange({
      from: "2026-06-20",
      to: "2026-06-22",
      dates: ["2026-06-20", "2026-06-21", "2026-06-22"],
      today: "2026-06-23",
      mode: "missing",
      retryFailed: true,
    });

    expect(result).toEqual({
      queued: ["2026-06-21", "2026-06-22"],
      skipped: ["2026-06-20"],
    });
    expect(enqueueIngestionDate).toHaveBeenCalledTimes(2);
    expect(enqueueIngestionDate).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        reportDate: "2026-06-21",
        mode: "retry_failed",
        resetAttempts: true,
      }),
    );
    expect(enqueueIngestionDate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        reportDate: "2026-06-22",
        mode: "missing",
        resetAttempts: true,
      }),
    );
  });
});

describe("processNextIngestionQueueItem", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(inspectIngestionQueueForRange).mockResolvedValue({
      counts: {
        pending: 0,
        claimable: 0,
        backoff: 0,
        exhausted: 0,
        running: 0,
        completed: 0,
        failed: 0,
      },
      idleReason: "empty",
      items: [],
    });
    vi.mocked(resolveQueueIdleReason).mockReturnValue("empty");
  });

  it("completes queue item after successful run", async () => {
    vi.mocked(claimNextIngestionDate).mockResolvedValue({
      id: "queue-1",
      job_name: "daily-fleet-report",
      report_date: "2026-06-22",
      mode: "missing",
      status: "running",
      attempts: 1,
      run_after: "2026-06-23T10:00:00Z",
      locked_at: "2026-06-23T10:00:00Z",
      lock_token: "token-1",
      completed_at: null,
      last_error: null,
      created_at: "2026-06-23T09:00:00Z",
      updated_at: "2026-06-23T10:00:00Z",
    });
    vi.mocked(runDailyFleetReport).mockResolvedValue({
      status: "completed",
      reportDate: "2026-06-22",
    });

    const result = await processNextIngestionQueueItem();

    expect(result.status).toBe("completed");
    expect(completeIngestionQueueItem).toHaveBeenCalledWith({
      id: "queue-1",
      lockToken: "token-1",
    });
  });

  it("claims only within requested range", async () => {
    vi.mocked(claimNextIngestionDate).mockResolvedValue({
      id: "queue-29",
      job_name: "daily-fleet-report",
      report_date: "2026-06-29",
      mode: "missing",
      status: "running",
      attempts: 1,
      run_after: "2026-06-30T07:00:00Z",
      locked_at: "2026-06-30T07:00:00Z",
      lock_token: "token-29",
      completed_at: null,
      last_error: null,
      created_at: "2026-06-30T07:00:00Z",
      updated_at: "2026-06-30T07:00:00Z",
    });
    vi.mocked(runDailyFleetReport).mockResolvedValue({
      status: "completed",
      reportDate: "2026-06-29",
    });

    const result = await processNextIngestionQueueItem({
      from: "2026-06-29",
      to: "2026-06-29",
    });

    expect(claimNextIngestionDate).toHaveBeenCalledWith("daily-fleet-report", {
      from: "2026-06-29",
      to: "2026-06-29",
    });
    expect(result.status).toBe("completed");
    expect(result.reportDate).toBe("2026-06-29");
    expect(runDailyFleetReport).toHaveBeenCalledWith(
      expect.objectContaining({ reportDate: "2026-06-29" }),
    );
  });

  it("returns idle for empty scoped queue", async () => {
    vi.mocked(claimNextIngestionDate).mockResolvedValue(null);
    vi.mocked(resolveQueueIdleReason).mockReturnValue("empty");

    const result = await processNextIngestionQueueItem({
      from: "2026-06-29",
      to: "2026-06-29",
    });

    expect(claimNextIngestionDate).toHaveBeenCalledWith("daily-fleet-report", {
      from: "2026-06-29",
      to: "2026-06-29",
    });
    expect(result.status).toBe("idle");
    expect(result.idleReason).toBe("empty");
    expect(runDailyFleetReport).not.toHaveBeenCalled();
  });

  it("reschedules queue item after failed run", async () => {
    vi.mocked(claimNextIngestionDate).mockResolvedValue({
      id: "queue-1",
      job_name: "daily-fleet-report",
      report_date: "2026-06-22",
      mode: "missing",
      status: "running",
      attempts: 1,
      run_after: "2026-06-23T10:00:00Z",
      locked_at: "2026-06-23T10:00:00Z",
      lock_token: "token-1",
      completed_at: null,
      last_error: null,
      created_at: "2026-06-23T09:00:00Z",
      updated_at: "2026-06-23T10:00:00Z",
    });
    vi.mocked(runDailyFleetReport).mockResolvedValue({
      status: "failed",
      reportDate: "2026-06-22",
      reason: "timeout",
    });

    const result = await processNextIngestionQueueItem();

    expect(result.status).toBe("failed");
    expect(failIngestionQueueItem).toHaveBeenCalled();
  });

  it("releases queue claim when chunk deadline leaves pending vehicles", async () => {
    vi.mocked(claimNextIngestionDate).mockResolvedValue({
      id: "queue-1",
      job_name: "daily-fleet-report",
      report_date: "2026-06-29",
      mode: "missing",
      status: "running",
      attempts: 1,
      run_after: "2026-06-30T07:00:00Z",
      locked_at: "2026-06-30T07:00:00Z",
      lock_token: "token-1",
      completed_at: null,
      last_error: null,
      created_at: "2026-06-30T07:00:00Z",
      updated_at: "2026-06-30T07:00:00Z",
    });
    vi.mocked(runDailyFleetReport).mockResolvedValue({
      status: "partial",
      reportDate: "2026-06-29",
      pendingVehicles: 12,
      deadlineHit: true,
    });

    const result = await processNextIngestionQueueItem({
      from: "2026-06-29",
      to: "2026-06-29",
      softDeadlineMs: 45_000,
    });

    expect(result.status).toBe("running");
    expect(result.remaining).toBe(12);
    expect(releaseIngestionQueueClaim).toHaveBeenCalled();
    expect(completeIngestionQueueItem).not.toHaveBeenCalled();
    expect(failIngestionQueueItem).not.toHaveBeenCalled();
  });
});
