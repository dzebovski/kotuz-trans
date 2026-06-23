import { getSupabaseAdmin } from "./supabase-admin";
import type { VehicleRecord } from "./vehicles-repository";

export type IngestionStatus = "running" | "completed" | "partial" | "failed";
export type IngestionPhase = "starting" | "processing" | "finalizing";
export type IngestionVehicleStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed";
export type IngestionMode = "missing" | "retry_failed" | "full_refresh";

export type IngestionCurrentVehicle = {
  wialonUnitId: number;
  displayName: string;
};

export type IngestionRunRecord = {
  id: string;
  job_name: string;
  report_date: string;
  status: IngestionStatus;
  expected_vehicles: number;
  successful_vehicles: number;
  failed_vehicles: number;
  started_at: string;
  heartbeat_at: string;
  completed_at: string | null;
  is_final: boolean;
  last_successful_at: string | null;
  finalized_at: string | null;
  error_summary: unknown;
  metadata: Record<string, unknown>;
};

export type IngestionRunVehicleRecord = {
  run_id: string;
  vehicle_id: string;
  status: IngestionVehicleStatus;
  attempts: number;
  last_error: string | null;
  started_at: string | null;
  completed_at: string | null;
};

const STALE_THRESHOLD_MS = 15 * 60 * 1000;

function initialProgressMetadata(): Record<string, unknown> {
  return {
    phase: "starting" satisfies IngestionPhase,
    currentVehicles: [] satisfies IngestionCurrentVehicle[],
  };
}

export async function getIngestionRun(
  jobName: string,
  reportDate: string,
): Promise<IngestionRunRecord | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("ingestion_runs")
    .select("*")
    .eq("job_name", jobName)
    .eq("report_date", reportDate)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to read ingestion run: ${error.message}`);
  }
  return (data as IngestionRunRecord | null) ?? null;
}

export async function acquireIngestionLock(input: {
  jobName: string;
  reportDate: string;
  expectedVehicles: number;
  force?: boolean;
  finalTarget?: boolean;
}): Promise<
  | { action: "start"; run: IngestionRunRecord }
  | { action: "skip"; reason: string; run: IngestionRunRecord }
> {
  const existing = await getIngestionRun(input.jobName, input.reportDate);
  if (!existing) {
    const { data, error } = await getSupabaseAdmin()
      .from("ingestion_runs")
      .insert({
        job_name: input.jobName,
        report_date: input.reportDate,
        status: "running",
        expected_vehicles: input.expectedVehicles,
        successful_vehicles: 0,
        failed_vehicles: 0,
        heartbeat_at: new Date().toISOString(),
        metadata: initialProgressMetadata(),
      })
      .select("*")
      .single();
    if (error) {
      throw new Error(`Failed to create ingestion run: ${error.message}`);
    }
    return { action: "start", run: data as IngestionRunRecord };
  }

  if (
    existing.status === "completed" &&
    (!input.finalTarget || existing.is_final) &&
    !input.force
  ) {
    return { action: "skip", reason: "already_processed", run: existing };
  }

  const heartbeatAge = Date.now() - new Date(existing.heartbeat_at).getTime();
  const isStaleRunning =
    existing.status === "running" && heartbeatAge > STALE_THRESHOLD_MS;
  if (existing.status === "running" && !isStaleRunning) {
    return { action: "skip", reason: "already_running", run: existing };
  }

  const canRetry =
    input.force ||
    existing.status === "failed" ||
    existing.status === "partial" ||
    isStaleRunning;

  if (!canRetry) {
    return { action: "skip", reason: "already_processed", run: existing };
  }

  const restartedAt = new Date().toISOString();
  const { data, error } = await getSupabaseAdmin()
    .from("ingestion_runs")
    .update({
      status: "running",
      expected_vehicles: input.expectedVehicles,
      successful_vehicles: 0,
      failed_vehicles: 0,
      started_at: restartedAt,
      completed_at: null,
      is_final: false,
      finalized_at: null,
      error_summary: [],
      heartbeat_at: restartedAt,
      metadata: {
        ...(existing.metadata ?? {}),
        ...initialProgressMetadata(),
      },
    })
    .eq("id", existing.id)
    .eq("heartbeat_at", existing.heartbeat_at)
    .select("*")
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to retry ingestion run: ${error.message}`);
  }
  if (!data) {
    const latest = await getIngestionRun(input.jobName, input.reportDate);
    if (!latest) {
      throw new Error("Ingestion run disappeared during lock acquisition");
    }
    return { action: "skip", reason: "lock_conflict", run: latest };
  }

  return { action: "start", run: data as IngestionRunRecord };
}

export async function ensureIngestionVehicleSnapshot(input: {
  runId: string;
  vehicles: VehicleRecord[];
  mode: IngestionMode;
}): Promise<IngestionRunVehicleRecord[]> {
  const supabase = getSupabaseAdmin();
  const { data: existing, error: readError } = await supabase
    .from("ingestion_run_vehicles")
    .select("*")
    .eq("run_id", input.runId);
  if (readError) {
    throw new Error(`Failed to read ingestion vehicle snapshot: ${readError.message}`);
  }

  let rows = (existing ?? []) as IngestionRunVehicleRecord[];
  if (rows.length === 0) {
    const snapshotAt = new Date().toISOString();
    const inserts = input.vehicles.map((vehicle) => ({
      run_id: input.runId,
      vehicle_id: vehicle.id,
      status: "pending" satisfies IngestionVehicleStatus,
    }));
    if (inserts.length > 0) {
      const { data, error } = await supabase
        .from("ingestion_run_vehicles")
        .insert(inserts)
        .select("*");
      if (error) {
        throw new Error(`Failed to create ingestion vehicle snapshot: ${error.message}`);
      }
      rows = (data ?? []) as IngestionRunVehicleRecord[];
    }
    const { error: metadataError } = await supabase
      .from("ingestion_runs")
      .update({
        expected_vehicles: input.vehicles.length,
        metadata: {
          phase: "starting" satisfies IngestionPhase,
          currentVehicles: [],
          snapshotCapturedAt: snapshotAt,
          snapshotVehicleIds: input.vehicles.map((vehicle) => vehicle.id),
        },
      })
      .eq("id", input.runId);
    if (metadataError) {
      throw new Error(`Failed to save ingestion snapshot metadata: ${metadataError.message}`);
    }
  }

  if (input.mode === "full_refresh") {
    const { data, error } = await supabase
      .from("ingestion_run_vehicles")
      .update({
        status: "pending",
        last_error: null,
        started_at: null,
        completed_at: null,
      })
      .eq("run_id", input.runId)
      .select("*");
    if (error) {
      throw new Error(`Failed to reset ingestion snapshot: ${error.message}`);
    }
    rows = (data ?? []) as IngestionRunVehicleRecord[];
  } else if (input.mode === "retry_failed") {
    const { data, error } = await supabase
      .from("ingestion_run_vehicles")
      .update({
        status: "pending",
        last_error: null,
        started_at: null,
        completed_at: null,
      })
      .eq("run_id", input.runId)
      .eq("status", "failed")
      .select("*");
    if (error) {
      throw new Error(`Failed to prepare failed vehicles for retry: ${error.message}`);
    }
    const retried = (data ?? []) as IngestionRunVehicleRecord[];
    const byId = new Map(rows.map((row) => [row.vehicle_id, row]));
    for (const row of retried) {
      byId.set(row.vehicle_id, row);
    }
    rows = [...byId.values()];
  }

  return rows;
}

export async function markIngestionVehiclesRunning(
  runId: string,
  vehicleIds: string[],
): Promise<void> {
  if (vehicleIds.length === 0) {
    return;
  }
  const now = new Date().toISOString();
  const supabase = getSupabaseAdmin();
  for (const vehicleId of vehicleIds) {
    const { data, error: readError } = await supabase
      .from("ingestion_run_vehicles")
      .select("attempts")
      .eq("run_id", runId)
      .eq("vehicle_id", vehicleId)
      .single();
    if (readError) {
      throw new Error(`Failed to read vehicle ingestion attempts: ${readError.message}`);
    }
    const { error } = await supabase
      .from("ingestion_run_vehicles")
      .update({
        status: "running",
        attempts: Number(data.attempts) + 1,
        started_at: now,
        completed_at: null,
        last_error: null,
      })
      .eq("run_id", runId)
      .eq("vehicle_id", vehicleId);
    if (error) {
      throw new Error(`Failed to mark ingestion vehicles running: ${error.message}`);
    }
  }
}

export async function markIngestionVehicleResult(input: {
  runId: string;
  vehicleId: string;
  success: boolean;
  error?: string;
}): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from("ingestion_run_vehicles")
    .update({
      status: input.success ? "completed" : "failed",
      completed_at: new Date().toISOString(),
      last_error: input.success ? null : input.error ?? "unknown",
    })
    .eq("run_id", input.runId)
    .eq("vehicle_id", input.vehicleId);
  if (error) {
    throw new Error(`Failed to save ingestion vehicle result: ${error.message}`);
  }
}

export async function getIngestionVehicleCounts(runId: string): Promise<{
  expected: number;
  successful: number;
  failed: number;
  pending: number;
}> {
  const { data, error } = await getSupabaseAdmin()
    .from("ingestion_run_vehicles")
    .select("status")
    .eq("run_id", runId);
  if (error) {
    throw new Error(`Failed to count ingestion vehicles: ${error.message}`);
  }
  const statuses = (data ?? []).map((row) => row.status as IngestionVehicleStatus);
  return {
    expected: statuses.length,
    successful: statuses.filter((status) => status === "completed").length,
    failed: statuses.filter((status) => status === "failed").length,
    pending: statuses.filter(
      (status) => status === "pending" || status === "running",
    ).length,
  };
}

export async function listIngestionRunsForRange(
  jobName: string,
  from: string,
  to: string,
): Promise<IngestionRunRecord[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("ingestion_runs")
    .select("*")
    .eq("job_name", jobName)
    .gte("report_date", from)
    .lte("report_date", to)
    .order("report_date");
  if (error) {
    throw new Error(`Failed to list ingestion runs: ${error.message}`);
  }
  return (data ?? []) as IngestionRunRecord[];
}

export async function updateIngestionProgress(input: {
  runId: string;
  successfulVehicles: number;
  failedVehicles: number;
  phase: IngestionPhase;
  currentVehicles: IngestionCurrentVehicle[];
}): Promise<void> {
  const { data: current, error: readError } = await getSupabaseAdmin()
    .from("ingestion_runs")
    .select("metadata")
    .eq("id", input.runId)
    .single();
  if (readError) {
    throw new Error(`Failed to read ingestion progress metadata: ${readError.message}`);
  }
  const { error } = await getSupabaseAdmin()
    .from("ingestion_runs")
    .update({
      successful_vehicles: input.successfulVehicles,
      failed_vehicles: input.failedVehicles,
      heartbeat_at: new Date().toISOString(),
      metadata: {
        ...((current.metadata as Record<string, unknown> | null) ?? {}),
        phase: input.phase,
        currentVehicles: input.currentVehicles,
      },
    })
    .eq("id", input.runId);
  if (error) {
    throw new Error(`Failed to update ingestion progress: ${error.message}`);
  }
}

export async function finalizeIngestionRun(input: {
  runId: string;
  status: IngestionStatus;
  successfulVehicles: number;
  failedVehicles: number;
  errorSummary: unknown[];
  metadata?: Record<string, unknown>;
  isFinal?: boolean;
}): Promise<void> {
  const completedAt = new Date().toISOString();
  const { data: current, error: readError } = await getSupabaseAdmin()
    .from("ingestion_runs")
    .select("metadata,last_successful_at")
    .eq("id", input.runId)
    .single();
  if (readError) {
    throw new Error(`Failed to read ingestion final metadata: ${readError.message}`);
  }
  const { error } = await getSupabaseAdmin()
    .from("ingestion_runs")
    .update({
      status: input.status,
      successful_vehicles: input.successfulVehicles,
      failed_vehicles: input.failedVehicles,
      completed_at: completedAt,
      heartbeat_at: completedAt,
      is_final: input.status === "completed" && input.isFinal === true,
      last_successful_at:
        input.successfulVehicles > 0
          ? completedAt
          : (current.last_successful_at as string | null),
      finalized_at:
        input.status === "completed" && input.isFinal === true
          ? completedAt
          : null,
      error_summary: input.errorSummary,
      metadata: {
        ...((current.metadata as Record<string, unknown> | null) ?? {}),
        ...(input.metadata ?? {}),
      },
    })
    .eq("id", input.runId);
  if (error) {
    throw new Error(`Failed to finalize ingestion run: ${error.message}`);
  }
}
