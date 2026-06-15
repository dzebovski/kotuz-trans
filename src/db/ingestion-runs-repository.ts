import { getSupabaseAdmin } from "./supabase-admin";

export type IngestionStatus = "running" | "completed" | "partial" | "failed";

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
  error_summary: unknown;
  metadata: Record<string, unknown>;
};

const STALE_THRESHOLD_MS = 15 * 60 * 1000;

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
      })
      .select("*")
      .single();
    if (error) {
      throw new Error(`Failed to create ingestion run: ${error.message}`);
    }
    return { action: "start", run: data as IngestionRunRecord };
  }

  if (existing.status === "completed" && !input.force) {
    return { action: "skip", reason: "already_processed", run: existing };
  }

  const heartbeatAge = Date.now() - new Date(existing.heartbeat_at).getTime();
  const isStaleRunning =
    existing.status === "running" && heartbeatAge > STALE_THRESHOLD_MS;
  const canRetry =
    input.force ||
    existing.status === "failed" ||
    existing.status === "partial" ||
    isStaleRunning;

  if (!canRetry && existing.status === "running") {
    return { action: "skip", reason: "already_running", run: existing };
  }

  if (!canRetry) {
    return { action: "skip", reason: "already_processed", run: existing };
  }

  const { data, error } = await getSupabaseAdmin()
    .from("ingestion_runs")
    .update({
      status: "running",
      expected_vehicles: input.expectedVehicles,
      successful_vehicles: 0,
      failed_vehicles: 0,
      completed_at: null,
      error_summary: [],
      heartbeat_at: new Date().toISOString(),
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

export async function updateIngestionHeartbeat(runId: string): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from("ingestion_runs")
    .update({ heartbeat_at: new Date().toISOString() })
    .eq("id", runId);
  if (error) {
    throw new Error(`Failed to update heartbeat: ${error.message}`);
  }
}

export async function finalizeIngestionRun(input: {
  runId: string;
  status: IngestionStatus;
  successfulVehicles: number;
  failedVehicles: number;
  errorSummary: unknown[];
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from("ingestion_runs")
    .update({
      status: input.status,
      successful_vehicles: input.successfulVehicles,
      failed_vehicles: input.failedVehicles,
      completed_at: new Date().toISOString(),
      heartbeat_at: new Date().toISOString(),
      error_summary: input.errorSummary,
      metadata: input.metadata ?? {},
    })
    .eq("id", input.runId);
  if (error) {
    throw new Error(`Failed to finalize ingestion run: ${error.message}`);
  }
}
