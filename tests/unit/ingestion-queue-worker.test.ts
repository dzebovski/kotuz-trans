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
  listIngestionQueueForRange,
  releaseIngestionQueueClaim,
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
});

describe("processNextIngestionQueueItem", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it("releases and skips items outside requested range", async () => {
    vi.mocked(claimNextIngestionDate)
      .mockResolvedValueOnce({
        id: "queue-1",
        job_name: "daily-fleet-report",
        report_date: "2026-06-01",
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
      })
      .mockResolvedValueOnce(null);

    const result = await processNextIngestionQueueItem({
      from: "2026-06-20",
      to: "2026-06-22",
    });

    expect(releaseIngestionQueueClaim).toHaveBeenCalled();
    expect(result.status).toBe("idle");
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
});
