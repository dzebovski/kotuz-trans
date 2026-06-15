-- Fleet Analytics: core Supabase bootstrap
-- Run this whole file in the same Supabase project where the app will live.

create extension if not exists pgcrypto;

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
  highway_ratio numeric(6, 5) check (highway_ratio between 0 and 1),
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
  baseline_average_l_per_100km numeric(10, 3),
  baseline_stddev_l_per_100km numeric(10, 3),
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
  check (interval_end > interval_start)
);

create table if not exists public.trip_segments (
  id uuid primary key default gen_random_uuid(),
  daily_trip_id uuid not null references public.daily_trips(id) on delete cascade,
  source_table_index integer not null default 0,
  source_row_number integer not null,
  segment_type text not null default 'trip',
  started_at timestamptz not null,
  ended_at timestamptz not null,
  duration_seconds integer check (duration_seconds >= 0),
  mileage_km numeric(12, 3) not null default 0 check (mileage_km >= 0),
  urban_mileage_km numeric(12, 3) not null default 0 check (urban_mileage_km >= 0),
  highway_mileage_km numeric(12, 3) not null default 0
    check (highway_mileage_km >= 0),
  average_fuel_consumption_l_per_100km numeric(10, 3),
  fuel_consumed_l numeric(12, 3),
  average_speed_kmh numeric(8, 2),
  max_speed_kmh numeric(8, 2),
  starting_fuel_l numeric(12, 3),
  ending_fuel_l numeric(12, 3),
  is_local_maneuver boolean not null default false,
  start_latitude numeric(9, 6),
  start_longitude numeric(10, 6),
  start_country_code char(2),
  start_city text,
  start_address text,
  end_latitude numeric(9, 6),
  end_longitude numeric(10, 6),
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

create table if not exists public.fuel_events (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete restrict,
  daily_trip_id uuid references public.daily_trips(id) on delete cascade,
  event_type text not null check (event_type in ('refill', 'drain')),
  event_time timestamptz not null,
  volume_l numeric(12, 3) not null check (volume_l > 0),
  latitude numeric(9, 6),
  longitude numeric(10, 6),
  address text,
  source_table_index integer,
  source_row_number integer,
  raw_event jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (vehicle_id, event_type, event_time, volume_l)
);

create index if not exists daily_trips_vehicle_date_idx
  on public.daily_trips (vehicle_id, report_date desc);

create index if not exists daily_trips_route_baseline_idx
  on public.daily_trips (vehicle_id, route_tag, route_key, report_date desc);

create index if not exists trip_segments_daily_trip_time_idx
  on public.trip_segments (daily_trip_id, started_at);

create index if not exists fuel_events_vehicle_time_idx
  on public.fuel_events (vehicle_id, event_time desc);

alter table public.vehicle_groups enable row level security;
alter table public.vehicles enable row level security;
alter table public.ingestion_runs enable row level security;
alter table public.daily_trips enable row level security;
alter table public.trip_segments enable row level security;
alter table public.fuel_events enable row level security;

insert into public.vehicle_groups (wialon_group_id, name, is_active)
values (2218, 'Брокінвест Групп, ТОВ', true)
on conflict (wialon_group_id) do update
set name = excluded.name, is_active = excluded.is_active;

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

select
  (select count(*) from public.vehicle_groups) as group_count,
  (select count(*) from public.vehicles) as vehicle_count;
