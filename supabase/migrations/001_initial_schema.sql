-- Fleet Analytics: initial Supabase/PostgreSQL schema
-- Run the whole file once in Supabase -> SQL Editor.
-- Do not put API tokens or other secrets into this file.

begin;

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

create table if not exists public.vehicle_groups (
  wialon_group_id bigint primary key,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  wialon_unit_id bigint not null unique,
  wialon_group_id bigint references public.vehicle_groups(wialon_group_id),
  display_name text not null,
  tractor_number text not null,
  trailer_number text,
  vin text,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.vehicles is
  'Fleet units synchronized from Moniterra/Wialon.';

create table if not exists public.ingestion_runs (
  id uuid primary key default gen_random_uuid(),
  job_name text not null default 'daily-fleet-report',
  report_date date not null,
  status text not null default 'running'
    check (status in ('running', 'completed', 'partial', 'failed')),
  expected_vehicles integer not null default 0 check (expected_vehicles >= 0),
  successful_vehicles integer not null default 0 check (successful_vehicles >= 0),
  failed_vehicles integer not null default 0 check (failed_vehicles >= 0),
  started_at timestamptz not null default now(),
  heartbeat_at timestamptz not null default now(),
  completed_at timestamptz,
  error_summary jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_name, report_date)
);

comment on table public.ingestion_runs is
  'One idempotent execution record per Cron job and business date.';

create table if not exists public.daily_trips (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete restrict,
  ingestion_run_id uuid references public.ingestion_runs(id) on delete set null,
  report_date date not null,
  interval_start timestamptz not null,
  interval_end timestamptz not null,

  mileage_km numeric(12, 3) not null default 0 check (mileage_km >= 0),
  urban_mileage_km numeric(12, 3) not null default 0
    check (urban_mileage_km >= 0),
  highway_mileage_km numeric(12, 3) not null default 0
    check (highway_mileage_km >= 0),
  highway_ratio numeric(6, 5)
    check (highway_ratio between 0 and 1),

  max_speed_kmh numeric(8, 2) check (max_speed_kmh >= 0),
  average_speed_kmh numeric(8, 2) check (average_speed_kmh >= 0),
  parking_count integer not null default 0 check (parking_count >= 0),

  starting_fuel_l numeric(12, 3) check (starting_fuel_l >= 0),
  ending_fuel_l numeric(12, 3) check (ending_fuel_l >= 0),
  fuel_consumed_l numeric(12, 3) check (fuel_consumed_l >= 0),
  average_fuel_consumption_l_per_100km numeric(10, 3)
    check (average_fuel_consumption_l_per_100km >= 0),
  refill_count integer not null default 0 check (refill_count >= 0),
  refilled_l numeric(12, 3) not null default 0 check (refilled_l >= 0),
  drain_count integer not null default 0 check (drain_count >= 0),
  drained_l numeric(12, 3) not null default 0 check (drained_l >= 0),

  route_tag text,
  route_key text,
  start_country_code char(2),
  start_city text,
  start_address text,
  end_country_code char(2),
  end_city text,
  end_address text,

  baseline_scope text,
  baseline_sample_size integer check (baseline_sample_size >= 0),
  baseline_average_l_per_100km numeric(10, 3)
    check (baseline_average_l_per_100km >= 0),
  baseline_stddev_l_per_100km numeric(10, 3)
    check (baseline_stddev_l_per_100km >= 0),
  deviation_percent numeric(10, 3),
  anomaly_status text not null default 'not_evaluated'
    check (
      anomaly_status in (
        'not_evaluated',
        'insufficient_history',
        'normal',
        'warning',
        'critical'
      )
    ),
  is_anomaly boolean not null default false,

  raw_report_stats jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (vehicle_id, report_date),
  check (interval_end > interval_start),
  check (
    urban_mileage_km + highway_mileage_km <= mileage_km + 2
  )
);

comment on table public.daily_trips is
  'One normalized daily aggregate per vehicle and business date.';

create table if not exists public.trip_segments (
  id uuid primary key default gen_random_uuid(),
  daily_trip_id uuid not null
    references public.daily_trips(id) on delete cascade,
  source_table_index integer not null default 0 check (source_table_index >= 0),
  source_row_number integer not null check (source_row_number >= 0),
  segment_type text not null default 'trip',
  started_at timestamptz not null,
  ended_at timestamptz not null,
  duration_seconds integer check (duration_seconds >= 0),
  mileage_km numeric(12, 3) not null default 0 check (mileage_km >= 0),
  is_local_maneuver boolean not null default false,

  start_latitude numeric(9, 6) check (start_latitude between -90 and 90),
  start_longitude numeric(10, 6) check (start_longitude between -180 and 180),
  start_country_code char(2),
  start_city text,
  start_address text,

  end_latitude numeric(9, 6) check (end_latitude between -90 and 90),
  end_longitude numeric(10, 6) check (end_longitude between -180 and 180),
  end_country_code char(2),
  end_city text,
  end_address text,

  driver_wialon_id bigint,
  driver_name text,
  raw_row jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),

  unique (daily_trip_id, source_table_index, source_row_number),
  check (ended_at >= started_at)
);

comment on table public.trip_segments is
  'Individual chronology rows used to construct route tags and route keys.';

create table if not exists public.fuel_events (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete restrict,
  daily_trip_id uuid references public.daily_trips(id) on delete cascade,
  event_type text not null check (event_type in ('refill', 'drain')),
  event_time timestamptz not null,
  volume_l numeric(12, 3) not null check (volume_l > 0),
  latitude numeric(9, 6) check (latitude between -90 and 90),
  longitude numeric(10, 6) check (longitude between -180 and 180),
  address text,
  source_table_index integer check (source_table_index >= 0),
  source_row_number integer check (source_row_number >= 0),
  raw_event jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),

  unique (
    vehicle_id,
    event_type,
    event_time,
    volume_l
  )
);

comment on table public.fuel_events is
  'Normalized Wialon refill and drain events.';

create index if not exists vehicles_active_idx
  on public.vehicles (is_active, wialon_unit_id);

create index if not exists daily_trips_vehicle_date_idx
  on public.daily_trips (vehicle_id, report_date desc);

create index if not exists daily_trips_route_baseline_idx
  on public.daily_trips (
    vehicle_id,
    route_tag,
    route_key,
    report_date desc
  )
  where average_fuel_consumption_l_per_100km is not null;

create index if not exists daily_trips_anomaly_idx
  on public.daily_trips (report_date desc, anomaly_status)
  where is_anomaly = true;

create index if not exists trip_segments_daily_trip_time_idx
  on public.trip_segments (daily_trip_id, started_at);

create index if not exists fuel_events_vehicle_time_idx
  on public.fuel_events (vehicle_id, event_time desc);

-- Finds a baseline without leaking data from the current/future report date.
-- Priority: exact route_key, then route_tag. If neither level has enough
-- history, the function returns no row and the app must not raise an anomaly.
create or replace function public.get_dynamic_fuel_baseline(
  p_vehicle_id uuid,
  p_report_date date,
  p_route_tag text,
  p_route_key text,
  p_highway_ratio numeric,
  p_lookback_days integer default 120,
  p_min_samples integer default 5,
  p_highway_tolerance numeric default 0.10
)
returns table (
  baseline_scope text,
  sample_size bigint,
  average_l_per_100km numeric,
  median_l_per_100km numeric,
  stddev_l_per_100km numeric
)
language sql
stable
as $$
  with eligible as (
    select d.*
    from public.daily_trips d
    where d.vehicle_id = p_vehicle_id
      and d.report_date < p_report_date
      and d.report_date >= p_report_date - p_lookback_days
      and d.route_tag = p_route_tag
      and d.average_fuel_consumption_l_per_100km is not null
      and d.mileage_km >= 20
      and d.is_anomaly = false
      and (
        p_highway_ratio is null
        or d.highway_ratio between
          greatest(0, p_highway_ratio - p_highway_tolerance)
          and least(1, p_highway_ratio + p_highway_tolerance)
      )
  ),
  candidates as (
    select
      'route_key'::text as scope,
      count(*)::bigint as samples,
      avg(average_fuel_consumption_l_per_100km)::numeric as avg_value,
      percentile_cont(0.5) within group (
        order by average_fuel_consumption_l_per_100km
      )::numeric as median_value,
      stddev_samp(average_fuel_consumption_l_per_100km)::numeric as stddev_value,
      1 as priority
    from eligible
    where p_route_key is not null
      and route_key = p_route_key
    having count(*) >= p_min_samples

    union all

    select
      'route_tag'::text as scope,
      count(*)::bigint as samples,
      avg(average_fuel_consumption_l_per_100km)::numeric as avg_value,
      percentile_cont(0.5) within group (
        order by average_fuel_consumption_l_per_100km
      )::numeric as median_value,
      stddev_samp(average_fuel_consumption_l_per_100km)::numeric as stddev_value,
      2 as priority
    from eligible
    having count(*) >= p_min_samples
  )
  select
    scope,
    samples,
    round(avg_value, 3),
    round(median_value, 3),
    round(coalesce(stddev_value, 0), 3)
  from candidates
  order by priority
  limit 1;
$$;

drop trigger if exists vehicle_groups_set_updated_at
  on public.vehicle_groups;
create trigger vehicle_groups_set_updated_at
before update on public.vehicle_groups
for each row execute function public.set_updated_at();

drop trigger if exists vehicles_set_updated_at
  on public.vehicles;
create trigger vehicles_set_updated_at
before update on public.vehicles
for each row execute function public.set_updated_at();

drop trigger if exists ingestion_runs_set_updated_at
  on public.ingestion_runs;
create trigger ingestion_runs_set_updated_at
before update on public.ingestion_runs
for each row execute function public.set_updated_at();

drop trigger if exists daily_trips_set_updated_at
  on public.daily_trips;
create trigger daily_trips_set_updated_at
before update on public.daily_trips
for each row execute function public.set_updated_at();

alter table public.vehicle_groups enable row level security;
alter table public.vehicles enable row level security;
alter table public.ingestion_runs enable row level security;
alter table public.daily_trips enable row level security;
alter table public.trip_segments enable row level security;
alter table public.fuel_events enable row level security;

-- The backend will use SUPABASE_SERVICE_ROLE_KEY.
-- No anon/authenticated policies are created at this stage.
revoke all on table public.vehicle_groups from anon, authenticated;
revoke all on table public.vehicles from anon, authenticated;
revoke all on table public.ingestion_runs from anon, authenticated;
revoke all on table public.daily_trips from anon, authenticated;
revoke all on table public.trip_segments from anon, authenticated;
revoke all on table public.fuel_events from anon, authenticated;
revoke execute on function public.get_dynamic_fuel_baseline(
  uuid, date, text, text, numeric, integer, integer, numeric
) from public, anon, authenticated;
grant execute on function public.get_dynamic_fuel_baseline(
  uuid, date, text, text, numeric, integer, integer, numeric
) to service_role;

insert into public.vehicle_groups (
  wialon_group_id,
  name,
  is_active
)
values (
  2218,
  'Брокінвест Групп, ТОВ',
  true
)
on conflict (wialon_group_id) do update
set
  name = excluded.name,
  is_active = excluded.is_active;

insert into public.vehicles (
  wialon_unit_id,
  wialon_group_id,
  display_name,
  tractor_number,
  trailer_number,
  is_active
)
values
  (3764, 2218, 'KA2790BA / AA2544XC', 'KA2790BA', 'AA2544XC', true),
  (3850, 2218, 'KA6149BC / АА1015XG', 'KA6149BC', 'АА1015XG', true),
  (9431, 2218, 'KA7136BE / AA2609XF', 'KA7136BE', 'AA2609XF', true),
  (9331, 2218, 'KA1629BM / AA2580XF', 'KA1629BM', 'AA2580XF', true),
  (4241, 2218, 'KA3081PH / АІ2276ХІ', 'KA3081PH', 'АІ2276ХІ', true),
  (4297, 2218, 'KA3083PH / АА1046XG', 'KA3083PH', 'АА1046XG', true),
  (6138, 2218, 'BC8336PC / AI2364XI', 'BC8336PC', 'AI2364XI', true),
  (9435, 2218, 'AI8486MX / АС6958XF', 'AI8486MX', 'АС6958XF', true),
  (6222, 2218, 'KA6013IK / AI2365XI', 'KA6013IK', 'AI2365XI', true),
  (6221, 2218, 'KA6017IK / AA1197XJ', 'KA6017IK', 'AA1197XJ', true),
  (6220, 2218, 'KA6019IK / AA6414XG', 'KA6019IK', 'AA6414XG', true),
  (9438, 2218, 'КА4465ЕI / AA3627XG', 'КА4465ЕI', 'AA3627XG', true),
  (6401, 2218, 'AC2096HI / AA5448XF', 'AC2096HI', 'AA5448XF', true),
  (7260, 2218, 'BC4236PX / BC3280XG', 'BC4236PX', 'BC3280XG', true),
  (10051, 2218, 'BС5138РН', 'BС5138РН', null, true),
  (7327, 2218, 'BC1189PP / BC4740XG', 'BC1189PP', 'BC4740XG', true),
  (2219, 2218, 'КА4614АС / ВІ2840ХК', 'КА4614АС', 'ВІ2840ХК', true),
  (9440, 2218, 'КА8464ММ / AA2291XH', 'КА8464ММ', 'AA2291XH', true),
  (2715, 2218, 'АА6616ХК / AA6616XK', 'АА6616ХК', 'AA6616XK', true),
  (9441, 2218, 'AA9223KM / АА2280ХН', 'AA9223KM', 'АА2280ХН', true),
  (9481, 2218, 'AA8670XC / AA1501XJ', 'AA8670XC', 'AA1501XJ', true),
  (3642, 2218, 'KA3643PK / АА2568XG', 'KA3643PK', 'АА2568XG', true),
  (3949, 2218, 'KA6130MO / AC6181XF', 'KA6130MO', 'AC6181XF', true),
  (3326, 2218, 'KA5423TE / AA7829XI', 'KA5423TE', 'AA7829XI', true)
on conflict (wialon_unit_id) do update
set
  wialon_group_id = excluded.wialon_group_id,
  display_name = excluded.display_name,
  tractor_number = excluded.tractor_number,
  trailer_number = excluded.trailer_number,
  is_active = excluded.is_active;

commit;

-- Verification queries:
-- select count(*) as vehicle_count from public.vehicles;
-- select * from public.vehicle_groups;
-- select wialon_unit_id, display_name from public.vehicles
-- order by wialon_unit_id;
