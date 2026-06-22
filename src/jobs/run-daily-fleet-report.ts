import {
  buildFleetSummary,
  type FleetVehicleSummary,
} from "@/analytics/fleet-summary";
import { getServerEnv } from "@/config/env";
import {
  acquireIngestionLock,
  finalizeIngestionRun,
  updateIngestionProgress,
} from "@/db/ingestion-runs-repository";
import { listActiveVehicles } from "@/db/vehicles-repository";
import { processVehicle } from "@/jobs/process-vehicle";
import { sendFleetReport } from "@/telegram/client";
import { mapWithConcurrency } from "@/utils/concurrency";
import { log } from "@/utils/logger";
import {
  getBusinessDayInterval,
  getPreviousBusinessDay,
} from "@/utils/time";

export type RunDailyFleetReportOptions = {
  reportDate?: string;
  sendTelegram?: boolean;
  force?: boolean;
  softDeadlineMs?: number | null;
};

export type RunDailyFleetReportResult = {
  status: "completed" | "partial" | "failed" | "skipped";
  reportDate: string;
  reason?: string;
  summary?: ReturnType<typeof buildFleetSummary>;
};

export const DAILY_FLEET_REPORT_JOB_NAME = "daily-fleet-report";

export async function runDailyFleetReport(
  options: RunDailyFleetReportOptions = {},
): Promise<RunDailyFleetReportResult> {
  const env = getServerEnv();
  const reportDate =
    options.reportDate ?? getPreviousBusinessDay(env.BUSINESS_TIMEZONE);
  const interval = getBusinessDayInterval(reportDate, env.BUSINESS_TIMEZONE);
  const vehicles = await listActiveVehicles();

  const lock = await acquireIngestionLock({
    jobName: DAILY_FLEET_REPORT_JOB_NAME,
    reportDate,
    expectedVehicles: vehicles.length,
    force: options.force,
  });

  if (lock.action === "skip") {
    return {
      status: "skipped",
      reportDate,
      reason: lock.reason,
    };
  }

  const run = lock.run;
  const softDeadlineMs =
    options.softDeadlineMs === undefined ? 270_000 : options.softDeadlineMs;
  const deadlineAt =
    softDeadlineMs == null ? null : Date.now() + softDeadlineMs;

  const successful: FleetVehicleSummary[] = [];
  const failedVehicles: Array<{ wialonUnitId: number; reason: string }> = [];
  const errorSummary: Array<Record<string, unknown>> = [];

  const pending = [...vehicles];
  while (pending.length > 0) {
    if (deadlineAt != null && Date.now() >= deadlineAt) {
      for (const vehicle of pending) {
        failedVehicles.push({
          wialonUnitId: vehicle.wialon_unit_id,
          reason: "deadline",
        });
        errorSummary.push({
          wialonUnitId: vehicle.wialon_unit_id,
          reason: "deadline",
        });
      }
      break;
    }

    const batchSize = Math.min(env.WIALON_CONCURRENCY, pending.length);
    const batch = pending.splice(0, batchSize);
    await updateIngestionProgress({
      runId: run.id,
      successfulVehicles: successful.length,
      failedVehicles: failedVehicles.length,
      phase: "processing",
      currentVehicles: batch.map((vehicle) => ({
        wialonUnitId: vehicle.wialon_unit_id,
        displayName: vehicle.display_name,
      })),
    });

    const results = await mapWithConcurrency(batch, batch.length, (vehicle) =>
      processVehicle({
        vehicle,
        ingestionRunId: run.id,
        interval,
        timezone: env.BUSINESS_TIMEZONE,
      }),
    );

    for (const result of results) {
      if (result.status === "fulfilled") {
        const value = result.value;
        if (value.success && value.summary) {
          successful.push(value.summary);
        } else {
          failedVehicles.push({
            wialonUnitId: value.vehicle.wialon_unit_id,
            reason: value.error ?? "unknown",
          });
          errorSummary.push({
            wialonUnitId: value.vehicle.wialon_unit_id,
            reason: value.error ?? "unknown",
          });
        }
      } else {
        const reason =
          result.reason instanceof Error
            ? result.reason.message
            : "unknown";
        failedVehicles.push({ wialonUnitId: -1, reason });
        errorSummary.push({ reason });
      }
    }

    await updateIngestionProgress({
      runId: run.id,
      successfulVehicles: successful.length,
      failedVehicles: failedVehicles.length,
      phase: "processing",
      currentVehicles: [],
    });
  }

  await updateIngestionProgress({
    runId: run.id,
    successfulVehicles: successful.length,
    failedVehicles: failedVehicles.length,
    phase: "finalizing",
    currentVehicles: [],
  });

  const status =
    successful.length === 0
      ? "failed"
      : failedVehicles.length > 0
        ? "partial"
        : "completed";

  const summary = buildFleetSummary({
    reportDate,
    expected: vehicles.length,
    vehicles: successful,
    failedVehicles,
  });

  let telegramError: string | null = null;
  if (options.sendTelegram) {
    try {
      await sendFleetReport(summary);
    } catch (error) {
      telegramError =
        error instanceof Error ? error.message : "Telegram send failed";
      log("error", "telegram_send_failed", { message: telegramError });
    }
  }

  await finalizeIngestionRun({
    runId: run.id,
    status,
    successfulVehicles: successful.length,
    failedVehicles: failedVehicles.length,
    errorSummary,
    metadata: {
      telegramError,
      reportDate,
      phase: "finalizing",
      currentVehicles: [],
    },
  });

  log("info", "daily_fleet_report_completed", {
    reportDate,
    status,
    processed: successful.length,
    failed: failedVehicles.length,
  });

  return {
    status,
    reportDate,
    summary,
    reason: telegramError ?? undefined,
  };
}
