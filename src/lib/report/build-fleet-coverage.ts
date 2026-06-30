import type { IngestionQueueRecord } from "@/db/ingestion-queue-repository";
import type {
  IngestionCurrentVehicle,
  IngestionRunRecord,
} from "@/db/ingestion-runs-repository";
import type { CoverageDay } from "@/lib/report/types";

function readCurrentVehicles(
  run?: IngestionRunRecord,
): IngestionCurrentVehicle[] | undefined {
  const raw = run?.metadata?.currentVehicles;
  if (!Array.isArray(raw) || raw.length === 0) {
    return undefined;
  }
  return raw as IngestionCurrentVehicle[];
}

export function buildFleetCoverageDay(input: {
  date: string;
  isToday: boolean;
  run?: IngestionRunRecord;
  queueItem?: IngestionQueueRecord;
}): CoverageDay {
  const { date, isToday, run, queueItem } = input;
  const ready =
    run?.status === "completed" && (isToday || run.is_final === true);

  let state: CoverageDay["state"] = "missing";
  if (ready) {
    state = isToday && !run?.is_final ? "provisional" : "ready";
  } else if (queueItem?.status === "failed") {
    state = "failed";
  } else if (run?.status === "running" || queueItem?.status === "running") {
    state = "running";
  } else if (run?.status === "partial") {
    state = "partial";
  } else if (queueItem?.status === "pending") {
    state = "queued";
  } else if (run?.status === "failed") {
    state = "failed";
  } else if (run?.status === "completed" && !run.is_final) {
    state = "provisional";
  }

  return {
    date,
    state,
    ready,
    isToday,
    successfulVehicles: run?.successful_vehicles ?? 0,
    failedVehicles: run?.failed_vehicles ?? 0,
    expectedVehicles: run?.expected_vehicles ?? 0,
    queueAttempts: queueItem?.attempts ?? 0,
    queueStatus: queueItem?.status ?? null,
    queueRunAfter: queueItem?.run_after ?? null,
    lastError: queueItem?.last_error ?? null,
    updatedAt:
      queueItem?.updated_at ??
      run?.completed_at ??
      run?.heartbeat_at ??
      null,
    currentVehicles: readCurrentVehicles(run),
  };
}

export function buildFleetCoverageDays(input: {
  dates: string[];
  today: string;
  runs: IngestionRunRecord[];
  queue: IngestionQueueRecord[];
}): CoverageDay[] {
  const runByDate = new Map(input.runs.map((run) => [run.report_date, run]));
  const queueByDate = new Map(input.queue.map((item) => [item.report_date, item]));

  return input.dates.map((date) =>
    buildFleetCoverageDay({
      date,
      isToday: date === input.today,
      run: runByDate.get(date),
      queueItem: queueByDate.get(date),
    }),
  );
}
