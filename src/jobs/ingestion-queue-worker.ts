import { getServerEnv } from "@/config/env";
import {
  claimNextIngestionDate,
  completeIngestionQueueItem,
  enqueueIngestionDate,
  failIngestionQueueItem,
  listIngestionQueueForRange,
  releaseIngestionQueueClaim,
  type IngestionQueueMode,
  type IngestionQueueRecord,
} from "@/db/ingestion-queue-repository";
import { listIngestionRunsForRange } from "@/db/ingestion-runs-repository";
import {
  DAILY_FLEET_REPORT_JOB_NAME,
  runDailyFleetReport,
} from "@/jobs/run-daily-fleet-report";

const MAX_RANGE_CLAIM_SKIPS = 20;

export type EnqueueMissingDatesInput = {
  from: string;
  to: string;
  dates: string[];
  today: string;
  mode: "missing" | "force";
  retryFailed?: boolean;
};

export type ProcessQueueItemResult = {
  status: "idle" | "completed" | "partial" | "failed" | "skipped";
  reportDate?: string;
  reason?: string | null;
  attempt?: number;
};

export async function enqueueMissingDatesForRange(
  input: EnqueueMissingDatesInput,
): Promise<{ queued: string[]; skipped: string[] }> {
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
  const skipped: string[] = [];

  for (const date of input.dates) {
    const isToday = date === input.today;
    const run = runByDate.get(date);
    const queueItem = queueByDate.get(date);

    if (
      input.mode === "missing" &&
      !isToday &&
      run?.status === "completed" &&
      run.is_final
    ) {
      skipped.push(date);
      continue;
    }
    if (
      input.mode === "missing" &&
      (run?.status === "running" ||
        queueItem?.status === "running" ||
        queueItem?.status === "pending")
    ) {
      skipped.push(date);
      continue;
    }
    if (
      input.mode === "missing" &&
      queueItem?.status === "failed" &&
      input.retryFailed !== true
    ) {
      skipped.push(date);
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
    queued.push(date);
  }

  return { queued, skipped };
}

function isDateInRange(
  date: string,
  from: string | undefined,
  to: string | undefined,
): boolean {
  if (!from || !to) {
    return true;
  }
  return date >= from && date <= to;
}

async function claimIngestionItemForRange(input: {
  from?: string;
  to?: string;
}): Promise<IngestionQueueRecord | null> {
  for (let attempt = 0; attempt < MAX_RANGE_CLAIM_SKIPS; attempt += 1) {
    const item = await claimNextIngestionDate(DAILY_FLEET_REPORT_JOB_NAME);
    if (!item?.lock_token) {
      return null;
    }
    if (isDateInRange(item.report_date, input.from, input.to)) {
      return item;
    }
    await releaseIngestionQueueClaim(item);
  }
  return null;
}

export async function processNextIngestionQueueItem(options?: {
  from?: string;
  to?: string;
  softDeadlineMs?: number | null;
}): Promise<ProcessQueueItemResult> {
  if (options?.softDeadlineMs != null && options.softDeadlineMs <= 0) {
    return { status: "idle" };
  }

  const env = getServerEnv();
  const item = await claimIngestionItemForRange({
    from: options?.from,
    to: options?.to,
  });
  if (!item?.lock_token) {
    return { status: "idle" };
  }

  try {
    const result = await runDailyFleetReport({
      reportDate: item.report_date,
      ingestionMode: item.mode,
      force: item.mode === "full_refresh",
      sendTelegram: false,
      softDeadlineMs: options?.softDeadlineMs ?? env.JOB_SOFT_DEADLINE_MS ?? 270_000,
    });

    if (
      result.status === "completed" ||
      result.reason === "already_processed"
    ) {
      await completeIngestionQueueItem({
        id: item.id,
        lockToken: item.lock_token,
      });
      return {
        status: result.status === "skipped" ? "skipped" : "completed",
        reportDate: item.report_date,
        reason: result.reason ?? null,
        attempt: item.attempts,
      };
    }

    await failIngestionQueueItem({
      item,
      error: result.reason ?? result.status,
      retryMode:
        result.status === "partial" || result.status === "failed"
          ? "retry_failed"
          : item.mode,
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
