import { getSupabaseAdmin } from "./supabase-admin";
import { log } from "@/utils/logger";

export type IngestionEventScope = "queue" | "run" | "vehicle";

export type IngestionEventType =
  | "queued"
  | "claimed"
  | "chunk_paused"
  | "started"
  | "succeeded"
  | "failed"
  | "retry_exhausted"
  | "finalized"
  | "blocked"
  | "deadline"
  | "skipped";

export type IngestionEventRecord = {
  id: string;
  job_name: string;
  report_date: string;
  run_id: string | null;
  vehicle_id: string | null;
  scope: IngestionEventScope;
  event_type: IngestionEventType;
  attempt: number | null;
  status: string | null;
  message: string | null;
  wialon_error_code: number | null;
  duration_ms: number | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type LogIngestionEventInput = {
  jobName: string;
  reportDate: string;
  scope: IngestionEventScope;
  eventType: IngestionEventType;
  runId?: string | null;
  vehicleId?: string | null;
  attempt?: number | null;
  status?: string | null;
  message?: string | null;
  wialonErrorCode?: number | null;
  durationMs?: number | null;
  metadata?: Record<string, unknown>;
};

const FORBIDDEN_MESSAGE_PATTERNS = [
  /token/i,
  /\bsid\b/i,
  /authorization/i,
  /cookie/i,
];

function sanitizeMessage(message: string | null | undefined): string | null {
  if (message == null || message === "") {
    return null;
  }
  if (FORBIDDEN_MESSAGE_PATTERNS.some((pattern) => pattern.test(message))) {
    return "[redacted]";
  }
  return message.slice(0, 2000);
}

export async function logIngestionEvent(
  input: LogIngestionEventInput,
): Promise<void> {
  try {
    const { error } = await getSupabaseAdmin().from("ingestion_events").insert({
      job_name: input.jobName,
      report_date: input.reportDate,
      run_id: input.runId ?? null,
      vehicle_id: input.vehicleId ?? null,
      scope: input.scope,
      event_type: input.eventType,
      attempt: input.attempt ?? null,
      status: input.status ?? null,
      message: sanitizeMessage(input.message),
      wialon_error_code: input.wialonErrorCode ?? null,
      duration_ms: input.durationMs ?? null,
      metadata: input.metadata ?? {},
    });
    if (error) {
      log("error", "ingestion_event_log_failed", {
        reportDate: input.reportDate,
        eventType: input.eventType,
        message: error.message,
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    log("error", "ingestion_event_log_failed", {
      reportDate: input.reportDate,
      eventType: input.eventType,
      message,
    });
  }
}

export async function listIngestionEventsForRange(
  jobName: string,
  from: string,
  to: string,
  limit = 200,
): Promise<IngestionEventRecord[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("ingestion_events")
    .select("*")
    .eq("job_name", jobName)
    .gte("report_date", from)
    .lte("report_date", to)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    throw new Error(`Failed to list ingestion events: ${error.message}`);
  }
  return (data ?? []) as IngestionEventRecord[];
}

export async function listIngestionEventsForVehicleRange(
  jobName: string,
  vehicleId: string,
  from: string,
  to: string,
  limit = 100,
): Promise<IngestionEventRecord[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("ingestion_events")
    .select("*")
    .eq("job_name", jobName)
    .eq("vehicle_id", vehicleId)
    .gte("report_date", from)
    .lte("report_date", to)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    throw new Error(
      `Failed to list vehicle ingestion events: ${error.message}`,
    );
  }
  return (data ?? []) as IngestionEventRecord[];
}
