import { getServerEnv } from "@/config/env";
import { logIngestionEvent } from "@/db/ingestion-events-repository";
import {
  claimNextIngestionDate,
  completeIngestionQueueItem,
  enqueueIngestionDate,
  failIngestionQueueItem,
  inspectIngestionQueueForRange,
  listIngestionQueueForRange,
  releaseIngestionQueueClaim,
  resolveQueueIdleReason,
  type IngestionQueueIdleReason,
  type IngestionQueueMode,
  type IngestionQueueRecord,
} from "@/db/ingestion-queue-repository";
import { listIngestionRunsForRange } from "@/db/ingestion-runs-repository";
import { DAILY_FLEET_REPORT_JOB_NAME } from "@/jobs/job-names";
import { runDailyFleetReport } from "@/jobs/run-daily-fleet-report";
import type { EnsureSkipReason, EnsureSkippedDate } from "@/lib/report/types";
import { log } from "@/utils/logger";

export type EnqueueMissingDatesInput = {
  from: string;
  to: string;
  dates: string[];
  today: string;
  mode: "missing" | "force";
  retryFailed?: boolean;
};

export type ProcessQueueItemResult = {
  status: "idle" | "completed" | "partial" | "failed" | "skipped" | "running";
  reportDate?: string;
  reason?: string | null;
  attempt?: number;
  idleReason?: IngestionQueueIdleReason;
  remaining?: number;
};

export async function enqueueMissingDatesForRange(
  input: EnqueueMissingDatesInput,
): Promise<{ queued: string[]; skipped: EnsureSkippedDate[] }> {
  const [runs, queue] = await Promise.all([
    listIngestionRunsForRange(
      DAILY_FLEET_REPORT_JOB_NAME,
      input.from,
      input.to,
    ),
    listIngestionQueueForRange(
      DAILY_FLEET_REPORT_JOB_NAME,
      input.from,
      input.to,
    ),
  ]);
  const runByDate = new Map(runs.map((run) => [run.report_date, run]));
  const queueByDate = new Map(queue.map((item) => [item.report_date, item]));
  const queued: string[] = [];
  const skipped: EnsureSkippedDate[] = [];

  for (const date of input.dates) {
    const isToday = date === input.today;
    const run = runByDate.get(date);
    const queueItem = queueByDate.get(date);

    const skipDate = async (reason: EnsureSkipReason): Promise<void> => {
      skipped.push({ date, reason });
      await logIngestionEvent({
        jobName: DAILY_FLEET_REPORT_JOB_NAME,
        reportDate: date,
        scope: "queue",
        eventType: "skipped",
        message: reason,
        attempt:
          reason === "queue_failed_needs_retry"
            ? queueItem?.attempts
            : undefined,
      });
    };

    if (
      input.mode === "missing" &&
      !isToday &&
      run?.status === "completed" &&
      run.is_final
    ) {
      await skipDate("already_final");
      continue;
    }
    if (
      input.mode === "missing" &&
      (run?.status === "running" ||
        queueItem?.status === "running" ||
        queueItem?.status === "pending")
    ) {
      await skipDate("already_queued_or_running");
      continue;
    }
    if (
      input.mode === "missing" &&
      queueItem?.status === "failed" &&
      input.retryFailed !== true
    ) {
      await skipDate("queue_failed_needs_retry");
      continue;
    }

    let mode: IngestionQueueMode;
    if (input.mode === "force" || isToday) {
      mode = "full_refresh";
    } else if (run?.status === "completed" && !run.is_final) {
      mode = "full_refresh";
    } else if (run?.status === "partial" || run?.status === "failed") {
      mode = "retry_failed";
    } else {
      mode = "missing";
    }

    await enqueueIngestionDate({
      jobName: DAILY_FLEET_REPORT_JOB_NAME,
      reportDate: date,
      mode,
      resetAttempts: input.retryFailed === true || input.mode === "force",
    });
    await logIngestionEvent({
      jobName: DAILY_FLEET_REPORT_JOB_NAME,
      reportDate: date,
      scope: "queue",
      eventType: "queued",
      status: mode,
      message:
        input.retryFailed === true ? "retry_failed_requested" : undefined,
    });
    queued.push(date);
  }

  return { queued, skipped };
}

async function claimIngestionItemForRange(input: {
  from?: string;
  to?: string;
}): Promise<IngestionQueueRecord | null> {
  const item = await claimNextIngestionDate(DAILY_FLEET_REPORT_JOB_NAME, {
    from: input.from,
    to: input.to,
  });
  if (item?.lock_token) {
    log("info", "ingestion_queue_claimed", {
      reportDate: item.report_date,
      mode: item.mode,
      attempt: item.attempts,
      from: input.from,
      to: input.to,
    });
  } else {
    log("info", "ingestion_queue_claim_empty", {
      from: input.from,
      to: input.to,
    });
  }
  return item;
}

async function buildIdleResult(input: {
  from?: string;
  to?: string;
  reason?: IngestionQueueIdleReason;
}): Promise<ProcessQueueItemResult> {
  if (input.reason) {
    return { status: "idle", idleReason: input.reason };
  }
  if (input.from && input.to) {
    const inspection = await inspectIngestionQueueForRange(
      DAILY_FLEET_REPORT_JOB_NAME,
      input.from,
      input.to,
    );
    const idleReason = resolveQueueIdleReason({
      items: inspection.items,
      from: input.from,
      to: input.to,
    });
    log("info", "ingestion_queue_idle", {
      from: input.from,
      to: input.to,
      idleReason,
      counts: inspection.counts,
    });
    return { status: "idle", idleReason };
  }
  return { status: "idle", idleReason: "empty" };
}

export async function processNextIngestionQueueItem(options?: {
  from?: string;
  to?: string;
  softDeadlineMs?: number | null;
}): Promise<ProcessQueueItemResult> {
  if (options?.softDeadlineMs != null && options.softDeadlineMs <= 0) {
    return { status: "idle", idleReason: "deadline" };
  }

  const env = getServerEnv();
  const item = await claimIngestionItemForRange({
    from: options?.from,
    to: options?.to,
  });
  if (!item?.lock_token) {
    return buildIdleResult({
      from: options?.from,
      to: options?.to,
    });
  }

  await logIngestionEvent({
    jobName: DAILY_FLEET_REPORT_JOB_NAME,
    reportDate: item.report_date,
    scope: "queue",
    eventType: "claimed",
    attempt: item.attempts,
    status: item.mode,
  });

  try {
    const result = await runDailyFleetReport({
      reportDate: item.report_date,
      ingestionMode: item.mode,
      force: item.mode === "full_refresh",
      sendTelegram: false,
      softDeadlineMs: options?.softDeadlineMs ?? env.JOB_SOFT_DEADLINE_MS ?? 270_000,
    });

    if (result.deadlineHit && (result.pendingVehicles ?? 0) > 0) {
      await releaseIngestionQueueClaim(item);
      await logIngestionEvent({
        jobName: DAILY_FLEET_REPORT_JOB_NAME,
        reportDate: item.report_date,
        scope: "queue",
        eventType: "chunk_paused",
        attempt: item.attempts,
        status: "running",
        message: `${result.pendingVehicles} vehicle(s) remaining`,
      });
      return {
        status: "running",
        reportDate: item.report_date,
        remaining: result.pendingVehicles,
        attempt: item.attempts,
      };
    }

    if (
      result.status === "completed" ||
      result.reason === "already_processed"
    ) {
      await completeIngestionQueueItem({
        id: item.id,
        lockToken: item.lock_token,
      });
      await logIngestionEvent({
        jobName: DAILY_FLEET_REPORT_JOB_NAME,
        reportDate: item.report_date,
        scope: "queue",
        eventType: "succeeded",
        attempt: item.attempts,
        status: "completed",
      });
      return {
        status: result.status === "skipped" ? "skipped" : "completed",
        reportDate: item.report_date,
        reason: result.reason ?? null,
        attempt: item.attempts,
      };
    }

    const exhausted = item.attempts >= 3;
    await failIngestionQueueItem({
      item,
      error: result.reason ?? result.status,
      retryMode:
        result.status === "partial" || result.status === "failed"
          ? "retry_failed"
          : item.mode,
    });
    await logIngestionEvent({
      jobName: DAILY_FLEET_REPORT_JOB_NAME,
      reportDate: item.report_date,
      scope: "queue",
      eventType: exhausted ? "retry_exhausted" : "failed",
      attempt: item.attempts,
      status: result.status,
      message: result.reason ?? result.status,
    });
    return {
      status: result.status === "skipped" ? "skipped" : result.status,
      reportDate: item.report_date,
      reason: result.reason ?? null,
      attempt: item.attempts,
    };
  } catch (runError) {
    const message =
      runError instanceof Error ? runError.message : "Unknown error";
    await failIngestionQueueItem({
      item,
      error: message,
    });
    const exhausted = item.attempts >= 3;
    await logIngestionEvent({
      jobName: DAILY_FLEET_REPORT_JOB_NAME,
      reportDate: item.report_date,
      scope: "queue",
      eventType: exhausted ? "retry_exhausted" : "failed",
      attempt: item.attempts,
      status: "failed",
      message,
    });
    return {
      status: "failed",
      reportDate: item.report_date,
      reason: message,
      attempt: item.attempts,
    };
  }
}

export async function drainIngestionQueue(options: {
  softDeadlineMs: number;
  from?: string;
  to?: string;
}): Promise<ProcessQueueItemResult[]> {
  const results: ProcessQueueItemResult[] = [];
  const deadline = Date.now() + options.softDeadlineMs;

  while (Date.now() < deadline) {
    const remainingMs = deadline - Date.now();
    const result = await processNextIngestionQueueItem({
      from: options.from,
      to: options.to,
      softDeadlineMs: remainingMs,
    });
    results.push(result);
    if (result.status === "idle") {
      break;
    }
  }

  return results;
}
