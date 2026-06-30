import { describe, expect, it } from "vitest";
import {
  inspectIngestionQueueItems,
  resolveQueueIdleReason,
  type IngestionQueueRecord,
} from "@/db/ingestion-queue-repository";

function queueItem(
  partial: Partial<IngestionQueueRecord> & Pick<IngestionQueueRecord, "report_date">,
): IngestionQueueRecord {
  return {
    id: "queue-1",
    job_name: "daily-fleet-report",
    mode: "missing",
    status: "pending",
    attempts: 0,
    run_after: "2026-06-30T07:00:00.000Z",
    locked_at: null,
    lock_token: null,
    completed_at: null,
    last_error: null,
    created_at: "2026-06-30T07:00:00.000Z",
    updated_at: "2026-06-30T07:00:00.000Z",
    ...partial,
  };
}

describe("inspectIngestionQueueItems", () => {
  it("counts claimable pending items", () => {
    const now = new Date("2026-06-30T08:00:00.000Z").getTime();
    const counts = inspectIngestionQueueItems(
      [
        queueItem({
          report_date: "2026-06-29",
          run_after: "2026-06-30T07:54:30.000Z",
        }),
      ],
      now,
    );

    expect(counts).toEqual({
      pending: 1,
      claimable: 1,
      backoff: 0,
      exhausted: 0,
      running: 0,
      completed: 0,
      failed: 0,
    });
  });

  it("counts backoff when run_after is in the future", () => {
    const now = new Date("2026-06-30T07:00:00.000Z").getTime();
    const counts = inspectIngestionQueueItems(
      [
        queueItem({
          report_date: "2026-06-29",
          run_after: "2026-06-30T08:00:00.000Z",
        }),
      ],
      now,
    );

    expect(counts.backoff).toBe(1);
    expect(counts.claimable).toBe(0);
  });
});

describe("resolveQueueIdleReason", () => {
  const now = new Date("2026-06-30T08:00:00.000Z").getTime();

  it("returns backoff when only future retries exist in range", () => {
    const reason = resolveQueueIdleReason({
      items: [
        queueItem({
          report_date: "2026-06-29",
          run_after: "2026-06-30T09:00:00.000Z",
        }),
      ],
      from: "2026-06-29",
      to: "2026-06-29",
      now,
    });

    expect(reason).toBe("backoff");
  });

  it("returns exhausted when attempts are spent", () => {
    const reason = resolveQueueIdleReason({
      items: [
        queueItem({
          report_date: "2026-06-29",
          attempts: 3,
          status: "failed",
        }),
      ],
      from: "2026-06-29",
      to: "2026-06-29",
      now,
    });

    expect(reason).toBe("exhausted");
  });
});
