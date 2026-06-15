-- Add segment-level metrics columns to trip_segments
alter table public.trip_segments
  add column if not exists urban_mileage_km numeric(12, 3)
    check (urban_mileage_km is null or urban_mileage_km >= 0),
  add column if not exists highway_mileage_km numeric(12, 3)
    check (highway_mileage_km is null or highway_mileage_km >= 0),
  add column if not exists average_fuel_consumption_l_per_100km numeric(10, 3)
    check (
      average_fuel_consumption_l_per_100km is null
      or average_fuel_consumption_l_per_100km >= 0
    ),
  add column if not exists fuel_consumed_l numeric(12, 3)
    check (fuel_consumed_l is null or fuel_consumed_l >= 0),
  add column if not exists average_speed_kmh numeric(8, 2)
    check (average_speed_kmh is null or average_speed_kmh >= 0),
  add column if not exists max_speed_kmh numeric(8, 2)
    check (max_speed_kmh is null or max_speed_kmh >= 0),
  add column if not exists starting_fuel_l numeric(12, 3)
    check (starting_fuel_l is null or starting_fuel_l >= 0),
  add column if not exists ending_fuel_l numeric(12, 3)
    check (ending_fuel_l is null or ending_fuel_l >= 0);
