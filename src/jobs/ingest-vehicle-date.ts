import { DateTime } from "luxon";
import { getServerEnv } from "@/config/env";
import { logIngestionEvent } from "@/db/ingestion-events-repository";
import {
  createIngestionRunForDate,
  ensureIngestionVehicleSnapshot,
  finalizeIngestionRun,
  getIngestionRun,
  getIngestionVehicleCounts,
  getIngestionVehicleRow,
  markIngestionRunProcessing,
  markIngestionVehicleResult,
  markIngestionVehiclesRunning,
  resetVehicleIngestionSnapshotRow,
  updateIngestionProgress,
  type IngestionMode,
} from "@/db/ingestion-runs-repository";
import { getDailyTripForVehicleDate } from "@/db/trips-repository";
import {
  getVehicleById,
  listActiveVehicles,
} from "@/db/vehicles-repository";
import { processVehicle } from "@/jobs/process-vehicle";
import { recalculateVehicleDerivedMetricsAfterDate } from "@/jobs/recalculate-derived-metrics";
import { DAILY_FLEET_REPORT_JOB_NAME } from "@/jobs/run-daily-fleet-report";
import { isFleetRunActivelyProcessing } from "@/lib/report/coverage";
import { getBusinessDayInterval } from "@/utils/time";

export type IngestVehicleDateMode = "missing" | "force";

export type IngestVehicleDateResult = {
  status:
    | "completed"
    | "partial"
    | "failed"
    | "skipped"
    | "blocked";
  reportDate: string;
  reason?: string | null;
};

export async function ingestVehicleForDate(input: {
  vehicleId: string;
  reportDate: string;
  mode: IngestVehicleDateMode;
  softDeadlineMs?: number | null;
}): Promise<IngestVehicleDateResult> {
  const env = getServerEnv();
  const vehicle = await getVehicleById(input.vehicleId);
  if (!vehicle) {
    return {
      status: "failed",
      reportDate: input.reportDate,
      reason: "vehicle_not_found",
    };
  }

  const existingRun = await getIngestionRun(
    DAILY_FLEET_REPORT_JOB_NAME,
    input.reportDate,
  );
  if (
    existingRun &&
    isFleetRunActivelyProcessing({
      status: existingRun.status,
      heartbeatAt: existingRun.heartbeat_at,
    })
  ) {
    await logIngestionEvent({
      jobName: DAILY_FLEET_REPORT_JOB_NAME,
      reportDate: input.reportDate,
      vehicleId: input.vehicleId,
      scope: "vehicle",
      eventType: "blocked",
      message: "fleet_import_running",
    });
    return {
      status: "blocked",
      reportDate: input.reportDate,
      reason: "fleet_import_running",
    };
  }

  const existingTrip = await getDailyTripForVehicleDate(
    input.vehicleId,
    input.reportDate,
  );
  if (input.mode === "missing" && existingTrip) {
    await logIngestionEvent({
      jobName: DAILY_FLEET_REPORT_JOB_NAME,
      reportDate: input.reportDate,
      vehicleId: input.vehicleId,
      scope: "vehicle",
      eventType: "skipped",
      message: "already_processed",
    });
    return {
      status: "skipped",
      reportDate: input.reportDate,
      reason: "already_processed",
    };
  }

  const activeVehicles = await listActiveVehicles();
  const interval = getBusinessDayInterval(input.reportDate, env.BUSINESS_TIMEZONE);
  const today = DateTime.now().setZone(env.BUSINESS_TIMEZONE).toISODate();
  const finalTarget = today != null && input.reportDate < today;
  const ingestionMode: IngestionMode =
    input.mode === "force" ? "full_refresh" : "missing";

  let run = existingRun;
  if (!run) {
    run = await createIngestionRunForDate({
      jobName: DAILY_FLEET_REPORT_JOB_NAME,
      reportDate: input.reportDate,
      expectedVehicles: activeVehicles.length,
    });
  } else if (run.status !== "running") {
    await markIngestionRunProcessing(run.id);
    run = (await getIngestionRun(
      DAILY_FLEET_REPORT_JOB_NAME,
      input.reportDate,
    ))!;
  }

  await ensureIngestionVehicleSnapshot({
    runId: run.id,
    vehicles: activeVehicles,
    mode: ingestionMode,
  });

  const vehicleRow = await getIngestionVehicleRow({
    runId: run.id,
    vehicleId: input.vehicleId,
  });
  if (
    input.mode === "force" ||
    vehicleRow?.status === "failed" ||
    (vehicleRow?.status === "completed" && !existingTrip)
  ) {
    await resetVehicleIngestionSnapshotRow({
      runId: run.id,
      vehicleId: input.vehicleId,
    });
  }

  await markIngestionVehiclesRunning(run.id, [input.vehicleId]);
  await updateIngestionProgress({
    runId: run.id,
    successfulVehicles: run.successful_vehicles,
    failedVehicles: run.failed_vehicles,
    phase: "processing",
    currentVehicles: [
      {
        wialonUnitId: vehicle.wialon_unit_id,
        displayName: vehicle.display_name,
      },
    ],
  });

  const processResult = await processVehicle({
    vehicle,
    ingestionRunId: run.id,
    interval,
    timezone: env.BUSINESS_TIMEZONE,
  });

  if (processResult.success) {
    await markIngestionVehicleResult({
      runId: run.id,
      vehicleId: input.vehicleId,
      success: true,
    });
    await recalculateVehicleDerivedMetricsAfterDate({
      vehicleId: input.vehicleId,
      changedReportDate: input.reportDate,
    });
  } else {
    await markIngestionVehicleResult({
      runId: run.id,
      vehicleId: input.vehicleId,
      success: false,
      error: processResult.error ?? "unknown",
    });
  }

  const counts = await getIngestionVehicleCounts(run.id);
  const runStatus =
    counts.successful === 0
      ? "failed"
      : counts.failed > 0 || counts.pending > 0
        ? "partial"
        : "completed";

  await finalizeIngestionRun({
    runId: run.id,
    status: runStatus,
    successfulVehicles: counts.successful,
    failedVehicles: counts.failed + counts.pending,
    errorSummary: processResult.success
      ? []
      : [
          {
            vehicleId: input.vehicleId,
            wialonUnitId: vehicle.wialon_unit_id,
            reason: processResult.error ?? "unknown",
          },
        ],
    isFinal: finalTarget && runStatus === "completed",
    metadata: {
      phase: "finalizing",
      currentVehicles: [],
    },
  });

  await logIngestionEvent({
    jobName: DAILY_FLEET_REPORT_JOB_NAME,
    reportDate: input.reportDate,
    runId: run.id,
    vehicleId: input.vehicleId,
    scope: "vehicle",
    eventType: processResult.success ? "succeeded" : "failed",
    status: processResult.success ? runStatus : "failed",
    message: processResult.error ?? null,
    metadata: { singleVehicleIngest: true },
  });

  return {
    status: processResult.success
      ? runStatus === "completed"
        ? "completed"
        : "partial"
      : "failed",
    reportDate: input.reportDate,
    reason: processResult.error ?? null,
  };
}

export function findNextVehicleIngestDate(input: {
  dates: string[];
  mode: IngestVehicleDateMode;
  afterDate?: string | null;
  coverageByDate: Map<
    string,
    { ready: boolean; state: string; fleetRunning: boolean }
  >;
}): { date: string | null; blocked: boolean } {
  const startIndex =
    input.afterDate != null
      ? Math.max(0, input.dates.indexOf(input.afterDate) + 1)
      : 0;

  for (let index = startIndex; index < input.dates.length; index += 1) {
    const date = input.dates[index]!;
    const day = input.coverageByDate.get(date);
    if (!day) {
      continue;
    }
    if (day.fleetRunning) {
      return { date: null, blocked: true };
    }
    if (input.mode === "force") {
      return { date, blocked: false };
    }
    if (!day.ready && day.state !== "running") {
      return { date, blocked: false };
    }
  }
  return { date: null, blocked: false };
}
