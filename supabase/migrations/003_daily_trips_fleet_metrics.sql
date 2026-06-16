-- Fleet metrics from Wialon .Поездки stats and rolling 1000 km consumption
alter table public.daily_trips
  add column if not exists movement_duration_seconds integer,
  add column if not exists stop_count integer not null default 0,
  add column if not exists parking_duration_seconds integer,
  add column if not exists parking_count_from_trips integer not null default 0,
  add column if not exists rolling_1000km_distance_km numeric(12, 3),
  add column if not exists rolling_1000km_fuel_l numeric(12, 3),
  add column if not exists rolling_1000km_consumption_l_per_100km numeric(10, 3);

create index if not exists trip_segments_ended_at_idx
  on public.trip_segments (ended_at desc);
