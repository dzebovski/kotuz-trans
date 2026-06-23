-- Date-range ingestion coverage, per-vehicle retries, and background queue.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

alter table public.ingestion_runs
  add column if not exists is_final boolean not null default false,
  add column if not exists last_successful_at timestamptz,
  add column if not exists finalized_at timestamptz;

create table if not exists public.ingestion_run_vehicles (
  run_id uuid not null
    references public.ingestion_runs(id) on delete cascade,
  vehicle_id uuid not null
    references public.vehicles(id) on delete restrict,
  status text not null default 'pending'
    check (status in ('pending', 'running', 'completed', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (run_id, vehicle_id)
);

create index if not exists ingestion_run_vehicles_status_idx
  on public.ingestion_run_vehicles (run_id, status);

create table if not exists public.ingestion_queue (
  id uuid primary key default gen_random_uuid(),
  job_name text not null default 'daily-fleet-report',
  report_date date not null,
  mode text not null default 'missing'
    check (mode in ('missing', 'retry_failed', 'full_refresh')),
  status text not null default 'pending'
    check (status in ('pending', 'running', 'completed', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  run_after timestamptz not null default now(),
  locked_at timestamptz,
  lock_token uuid,
  completed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_name, report_date)
);

create index if not exists ingestion_queue_claim_idx
  on public.ingestion_queue (job_name, status, run_after, report_date);

drop trigger if exists ingestion_run_vehicles_set_updated_at
  on public.ingestion_run_vehicles;
create trigger ingestion_run_vehicles_set_updated_at
before update on public.ingestion_run_vehicles
for each row execute function public.set_updated_at();

drop trigger if exists ingestion_queue_set_updated_at
  on public.ingestion_queue;
create trigger ingestion_queue_set_updated_at
before update on public.ingestion_queue
for each row execute function public.set_updated_at();

alter table public.ingestion_run_vehicles enable row level security;
alter table public.ingestion_queue enable row level security;

revoke all on table public.ingestion_run_vehicles from anon, authenticated;
revoke all on table public.ingestion_queue from anon, authenticated;
grant all on table public.ingestion_run_vehicles to service_role;
grant all on table public.ingestion_queue to service_role;

create or replace function public.claim_next_ingestion_queue(
  p_job_name text,
  p_stale_before timestamptz
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

revoke all on function public.claim_next_ingestion_queue(text, timestamptz)
  from public;
grant execute on function public.claim_next_ingestion_queue(text, timestamptz)
  to service_role;

-- Force Supabase/PostgREST to refresh the schema cache after new tables/RPCs.
notify pgrst, 'reload schema';
