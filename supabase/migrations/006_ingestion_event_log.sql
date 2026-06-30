-- Append-only ingestion event log for per-day and per-vehicle diagnostics.

create table if not exists public.ingestion_events (
  id uuid primary key default gen_random_uuid(),
  job_name text not null default 'daily-fleet-report',
  report_date date not null,
  run_id uuid references public.ingestion_runs(id) on delete set null,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  scope text not null
    check (scope in ('queue', 'run', 'vehicle')),
  event_type text not null
    check (
      event_type in (
        'queued',
        'claimed',
        'started',
        'succeeded',
        'failed',
        'retry_exhausted',
        'finalized',
        'blocked',
        'deadline',
        'skipped'
      )
    ),
  attempt integer check (attempt is null or attempt >= 0),
  status text,
  message text,
  wialon_error_code integer,
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.ingestion_events is
  'Append-only log of ingestion queue, run, and per-vehicle events.';

create index if not exists ingestion_events_job_date_created_idx
  on public.ingestion_events (job_name, report_date, created_at desc);

create index if not exists ingestion_events_vehicle_created_idx
  on public.ingestion_events (vehicle_id, created_at desc)
  where vehicle_id is not null;

alter table public.ingestion_events enable row level security;

revoke all on table public.ingestion_events from anon, authenticated;
grant all on table public.ingestion_events to service_role;

notify pgrst, 'reload schema';
