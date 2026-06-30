-- Scope ingestion queue claims to an optional report_date range.
-- NULL from/to preserves global FIFO behavior for cron workers.

drop function if exists public.claim_next_ingestion_queue(text, timestamptz);

create or replace function public.claim_next_ingestion_queue(
  p_job_name text,
  p_stale_before timestamptz,
  p_from date default null,
  p_to date default null
)
returns public.ingestion_queue
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed public.ingestion_queue;
begin
  with candidate as (
    select id
    from public.ingestion_queue
    where job_name = p_job_name
      and attempts < 3
      and run_after <= now()
      and (p_from is null or report_date >= p_from)
      and (p_to is null or report_date <= p_to)
      and (
        status = 'pending'
        or (status = 'running' and locked_at < p_stale_before)
      )
    order by report_date asc, created_at asc
    for update skip locked
    limit 1
  )
  update public.ingestion_queue q
  set status = 'running',
      attempts = q.attempts + 1,
      locked_at = now(),
      lock_token = gen_random_uuid(),
      last_error = null,
      completed_at = null
  from candidate
  where q.id = candidate.id
  returning q.* into claimed;

  return claimed;
end;
$$;

revoke all on function public.claim_next_ingestion_queue(text, timestamptz, date, date)
  from public;
grant execute on function public.claim_next_ingestion_queue(text, timestamptz, date, date)
  to service_role;

notify pgrst, 'reload schema';
