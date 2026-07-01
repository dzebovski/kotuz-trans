alter table public.daily_trips
  add column if not exists over_speed_limit_duration_seconds integer
    check (
      over_speed_limit_duration_seconds is null
      or over_speed_limit_duration_seconds >= 0
    );
