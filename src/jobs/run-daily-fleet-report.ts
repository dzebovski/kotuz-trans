import {
  buildFleetSummary,
  type FleetVehicleSummary,
} from "@/analytics/fleet-summary";
import { getServerEnv } from "@/config/env";
import {
  acquireIngestionLock,
  ensureIngestionVehicleSnapshot,
  finalizeIngestionRun,
  getIngestionVehicleCounts,
  markIngestionVehicleResult,
  markIngestionVehiclesRunning,
  updateIngestionProgress,
  type IngestionMode,
} from "@/db/ingestion-runs-repository";
import {
  listActiveVehicles,
  listVehiclesByIds,
} from "@/db/vehicles-repository";
import { processVehicle } from "@/jobs/process-vehicle";
import { recalculateVehicleDerivedMetricsAfterDate } from "@/jobs/recalculate-derived-metrics";
import { sendFleetReport } from "@/telegram/client";
import { mapWithConcurrency } from "@/utils/concurrency";
import { log } from "@/utils/logger";
import {
  getBusinessDayInterval,
  getPreviousBusinessDay,
} from "@/utils/time";
import { DateTime } from "luxon";

export type RunDailyFleetReportOptions = {
  reportDate?: string;
  sendTelegram?: boolean;
  force?: boolean;
  ingestionMode?: IngestionMode;
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
  const activeVehicles = await listActiveVehicles();
  const ingestionMode =
    options.ingestionMode ??
    (options.force || options.reportDate == null ? "full_refresh" : "missing");
  const today = DateTime.now().setZone(env.BUSINESS_TIMEZONE).toISODate();
  const finalTarget = today != null && reportDate < today;

  const lock = await acquireIngestionLock({
    jobName: DAILY_FLEET_REPORT_JOB_NAME,
    reportDate,
    expectedVehicles: activeVehicles.length,
    force: ingestionMode === "full_refresh" || options.force,
    finalTarget,
  });

  if (lock.action === "skip") {
    return {
      status: "skipped",
      reportDate,
      reason: lock.reason,
    };
  }

  const run = lock.run;
  const snapshot = await ensureIngestionVehicleSnapshot({
    runId: run.id,
    vehicles: activeVehicles,
    mode: ingestionMode,
  });
  const selectedSnapshotRows =
    ingestionMode === "full_refresh"
      ? snapshot
      : snapshot.filter((row) => row.status !== "completed");
  const vehicles = await listVehiclesByIds(
    selectedSnapshotRows.map((row) => row.vehicle_id),
  );
  const softDeadlineMs =
    options.softDeadlineMs === undefined ? 270_000 : options.softDeadlineMs;
  const deadlineAt =
    softDeadlineMs == null ? null : Date.now() + softDeadlineMs;

  const successful: FleetVehicleSummary[] = [];
  const successfulVehicleIds: string[] = [];
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
        await markIngestionVehicleResult({
          runId: run.id,
          vehicleId: vehicle.id,
          success: false,
          error: "deadline",
        });
      }
      break;
    }

    const batchSize = Math.min(env.WIALON_CONCURRENCY, pending.length);
    const batch = pending.splice(0, batchSize);
    await markIngestionVehiclesRunning(
      run.id,
      batch.map((vehicle) => vehicle.id),
    );
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

    for (const [index, result] of results.entries()) {
      const vehicle = batch[index];
      if (result.status === "fulfilled") {
        const value = result.value;
        if (value.success && value.summary) {
          successful.push(value.summary);
          successfulVehicleIds.push(vehicle.id);
          await markIngestionVehicleResult({
            runId: run.id,
            vehicleId: vehicle.id,
            success: true,
          });
        } else {
          failedVehicles.push({
            wialonUnitId: value.vehicle.wialon_unit_id,
            reason: value.error ?? "unknown",
          });
          errorSummary.push({
            wialonUnitId: value.vehicle.wialon_unit_id,
            reason: value.error ?? "unknown",
          });
          await markIngestionVehicleResult({
            runId: run.id,
            vehicleId: vehicle.id,
            success: false,
            error: value.error ?? "unknown",
          });
        }
      } else {
        const reason =
          result.reason instanceof Error
            ? result.reason.message
            : "unknown";
        failedVehicles.push({ wialonUnitId: vehicle.wialon_unit_id, reason });
        errorSummary.push({ wialonUnitId: vehicle.wialon_unit_id, reason });
        await markIngestionVehicleResult({
          runId: run.id,
          vehicleId: vehicle.id,
          success: false,
          error: reason,
        });
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

  const recalculationResults = await mapWithConcurrency(
    successfulVehicleIds,
    Math.max(1, env.WIALON_CONCURRENCY),
    (vehicleId) =>
      recalculateVehicleDerivedMetricsAfterDate({
        vehicleId,
        changedReportDate: reportDate,
      }),
  );
  for (const [index, result] of recalculationResults.entries()) {
    if (result.status === "rejected") {
      const vehicleId = successfulVehicleIds[index];
      const vehicle = vehicles.find((candidate) => candidate.id === vehicleId);
      const reason =
        result.reason instanceof Error
          ? result.reason.message
          : "Derived metrics recalculation failed";
      errorSummary.push({
        vehicleId,
        wialonUnitId: vehicle?.wialon_unit_id,
        reason,
      });
      await markIngestionVehicleResult({
        runId: run.id,
        vehicleId,
        success: false,
        error: reason,
      });
    }
  }

  const counts = await getIngestionVehicleCounts(run.id);
  const status =
    counts.successful === 0
      ? "failed"
      : counts.failed > 0 || counts.pending > 0
        ? "partial"
        : "completed";

  const summary = buildFleetSummary({
    reportDate,
    expected: counts.expected,
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
    successfulVehicles: counts.successful,
    failedVehicles: counts.failed + counts.pending,
    errorSummary,
    isFinal: finalTarget,
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
    failed: counts.failed + counts.pending,
  });

  return {
    status,
    reportDate,
    summary,
    reason: telegramError ?? undefined,
  };
}
