import { getSupabaseAdmin } from "./supabase-admin";

export type IngestionQueueMode = "missing" | "retry_failed" | "full_refresh";
export type IngestionQueueStatus = "pending" | "running" | "completed" | "failed";

export type IngestionQueueRecord = {
  id: string;
  job_name: string;
  report_date: string;
  mode: IngestionQueueMode;
  status: IngestionQueueStatus;
  attempts: number;
  run_after: string;
  locked_at: string | null;
  lock_token: string | null;
  completed_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

const RETRY_DELAYS_MS = [5 * 60_000, 15 * 60_000, 60 * 60_000] as const;
const STALE_QUEUE_MS = 15 * 60_000;

const MODE_PRIORITY: Record<IngestionQueueMode, number> = {
  missing: 0,
  retry_failed: 1,
  full_refresh: 2,
};

export async function enqueueIngestionDate(input: {
  jobName: string;
  reportDate: string;
  mode: IngestionQueueMode;
  resetAttempts?: boolean;
}): Promise<IngestionQueueRecord> {
  const supabase = getSupabaseAdmin();
  const { data: existing, error: readError } = await supabase
    .from("ingestion_queue")
    .select("*")
    .eq("job_name", input.jobName)
    .eq("report_date", input.reportDate)
    .maybeSingle();

  if (readError) {
    throw new Error(`Failed to read ingestion queue: ${readError.message}`);
  }

  if (!existing) {
    const { data, error } = await supabase
      .from("ingestion_queue")
      .insert({
        job_name: input.jobName,
        report_date: input.reportDate,
        mode: input.mode,
        status: "pending",
      })
      .select("*")
      .single();
    if (error) {
      if (error.code === "23505") {
        return enqueueIngestionDate(input);
      }
      throw new Error(`Failed to enqueue ingestion date: ${error.message}`);
    }
    return data as IngestionQueueRecord;
  }

  const current = existing as IngestionQueueRecord;
  const mode =
    MODE_PRIORITY[input.mode] > MODE_PRIORITY[current.mode]
      ? input.mode
      : current.mode;
  const shouldReopen =
    current.status === "completed" ||
    current.status === "failed" ||
    input.resetAttempts === true;

  if (!shouldReopen && mode === current.mode) {
    return current;
  }

  const { data, error } = await supabase
    .from("ingestion_queue")
    .update({
      mode,
      status: shouldReopen ? "pending" : current.status,
      attempts: input.resetAttempts ? 0 : current.attempts,
      run_after: shouldReopen ? new Date().toISOString() : current.run_after,
      locked_at: shouldReopen ? null : current.locked_at,
      lock_token: shouldReopen ? null : current.lock_token,
      completed_at: null,
      last_error: null,
    })
    .eq("id", current.id)
    .select("*")
    .single();
  if (error) {
    throw new Error(`Failed to update ingestion queue: ${error.message}`);
  }
  return data as IngestionQueueRecord;
}

export async function listIngestionQueueForRange(
  jobName: string,
  from: string,
  to: string,
): Promise<IngestionQueueRecord[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("ingestion_queue")
    .select("*")
    .eq("job_name", jobName)
    .gte("report_date", from)
    .lte("report_date", to)
    .order("report_date");
  if (error) {
    throw new Error(`Failed to list ingestion queue: ${error.message}`);
  }
  return (data ?? []) as IngestionQueueRecord[];
}

export async function claimNextIngestionDate(
  jobName: string,
): Promise<IngestionQueueRecord | null> {
  const staleBefore = new Date(Date.now() - STALE_QUEUE_MS).toISOString();
  const { data, error } = await getSupabaseAdmin().rpc(
    "claim_next_ingestion_queue",
    {
      p_job_name: jobName,
      p_stale_before: staleBefore,
    },
  );
  if (error) {
    throw new Error(`Failed to claim ingestion queue: ${error.message}`);
  }
  return (data as IngestionQueueRecord | null) ?? null;
}

export async function releaseIngestionQueueClaim(
  item: IngestionQueueRecord,
): Promise<void> {
  if (!item.lock_token) {
    return;
  }
  const { error } = await getSupabaseAdmin()
    .from("ingestion_queue")
    .update({
      status: "pending",
      attempts: Math.max(0, item.attempts - 1),
      locked_at: null,
      lock_token: null,
    })
    .eq("id", item.id)
    .eq("lock_token", item.lock_token);
  if (error) {
    throw new Error(`Failed to release ingestion queue claim: ${error.message}`);
  }
}

export async function completeIngestionQueueItem(input: {
  id: string;
  lockToken: string;
}): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from("ingestion_queue")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      locked_at: null,
      lock_token: null,
      last_error: null,
    })
    .eq("id", input.id)
    .eq("lock_token", input.lockToken);
  if (error) {
    throw new Error(`Failed to complete ingestion queue item: ${error.message}`);
  }
}

export async function failIngestionQueueItem(input: {
  item: IngestionQueueRecord;
  error: string;
  retryMode?: IngestionQueueMode;
}): Promise<void> {
  const exhausted = input.item.attempts >= RETRY_DELAYS_MS.length;
  const delay =
    RETRY_DELAYS_MS[
      Math.min(input.item.attempts - 1, RETRY_DELAYS_MS.length - 1)
    ];
  const { error } = await getSupabaseAdmin()
    .from("ingestion_queue")
    .update({
      mode: input.retryMode ?? input.item.mode,
      status: exhausted ? "failed" : "pending",
      run_after: new Date(Date.now() + delay).toISOString(),
      locked_at: null,
      lock_token: null,
      last_error: input.error,
    })
    .eq("id", input.item.id)
    .eq("lock_token", input.item.lock_token);
  if (error) {
    throw new Error(`Failed to reschedule ingestion queue item: ${error.message}`);
  }
}
