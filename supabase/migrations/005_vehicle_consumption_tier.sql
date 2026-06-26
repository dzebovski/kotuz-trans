begin;

alter table public.vehicles
  add column if not exists consumption_tier smallint
    check (consumption_tier in (30, 32));

alter table public.daily_trips
  drop constraint if exists daily_trips_anomaly_status_check;

update public.daily_trips
set anomaly_status = 'high'
where anomaly_status in ('warning', 'critical');

update public.daily_trips
set anomaly_status = 'not_evaluated'
where anomaly_status = 'insufficient_history';

alter table public.daily_trips
  add constraint daily_trips_anomaly_status_check
    check (
      anomaly_status in ('not_evaluated', 'normal', 'avrg', 'high')
    );

update public.vehicles
set consumption_tier = 30
where wialon_unit_id in (
  9438, 9435, 3326, 7260, 6220, 7327, 6222, 4241, 6401, 3850,
  9331, 6221, 6138, 3764, 9431, 10051, 4297
);

update public.vehicles
set consumption_tier = 32
where wialon_unit_id in (9440, 9481, 3949, 9441, 2715, 2219, 3642);

commit;
