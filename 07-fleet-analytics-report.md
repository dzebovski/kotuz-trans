# Звіт: розширення fleet-аналітики по машинах

Дата: 2026-06-16  
Проєкт: `fleet-analytics` (`/Users/dzebski/Documents/kotuz/anal`)

## Мета

Розширити подобову fleet-аналітику **по машинах** (не по водіях):

- ingest з Wialon report `.Поездки` (template `11`);
- збереження агрегатів руху/стоянок і rolling розходу в Supabase;
- відображення на сайті: summary флоту, таблиця машин, деталі з рейсами за добу.

Сайт читає **тільки Supabase**. Wialon/Moniterra викликається лише з backend ingest/job.

---

## Що зроблено

### 1. Міграція БД

Файл: `supabase/migrations/003_daily_trips_fleet_metrics.sql`

Додано в `daily_trips`:

| Колонка | Тип | Опис |
|---------|-----|------|
| `movement_duration_seconds` | `integer` | Час у русі за добу (з trips stats) |
| `stop_count` | `integer` | Кількість зупинок |
| `parking_duration_seconds` | `integer` | Тривалість стоянок |
| `parking_count_from_trips` | `integer` | Кількість стоянок (з trips stats) |
| `rolling_1000km_distance_km` | `numeric(12,3)` | Пробіг у rolling-вікні |
| `rolling_1000km_fuel_l` | `numeric(12,3)` | Паливо у rolling-вікні |
| `rolling_1000km_consumption_l_per_100km` | `numeric(10,3)` | Середній розхід л/100 км на ~1000 км |

Індекс: `trip_segments_ended_at_idx` на `trip_segments (ended_at desc)` — для rolling-запиту.

### 2. Парсер Wialon `.Поездки` stats

Файл: `src/wialon/parsers/trips-report.ts`

- `parseTripsDailyStats(stats)` — парсинг **по label**, не по порядку рядків.
- Duration (`Время в движении`, `Продолжительность стоянок`) → секунди через `parseDurationToSeconds`.
- Підтримка формату `1 days 21:44:31` у `src/utils/duration.ts`.
- Невідомі labels не ламають парсер; зберігаються в `raw_report_stats.trips`.
- Рядки поїздок (`rows`) як і раніше парсяться index-based у `trip_segments`.

Мапінг labels → поля:

| Label Wialon | Поле в коді / БД |
|--------------|------------------|
| Время в движении | `movement_duration_seconds` |
| Количество остановок | `stop_count` |
| Продолжительность стоянок | `parking_duration_seconds` |
| Количество стоянок | `parking_count_from_trips` |
| Пробег в поездках, скорости, ДУТ | raw + дублюють fuel report (не замінюють паливну логіку) |

### 3. Rolling ~1000 км

Файли:

- `src/analytics/rolling-fuel.ts` — `calculateRolling1000KmConsumption()`
- `src/db/trips-repository.ts` — `getRecentTripSegmentsForVehicle()`

Логіка:

1. Бере `trip_segments` машини назад по `ended_at` (сьогоднішні + історія з БД).
2. Сумує `mileage_km` і `fuel_consumed_l` до ~1000 км.
3. `consumption = fuel / distance * 100`.
4. Якщо даних < 100 км або `fuel_consumed_l` null — повертає `null` без падіння.

### 4. Ingest

Файл: `src/jobs/process-vehicle.ts`

На кожну машину за business-добу:

1. Fuel report → паливо, anomaly, baseline (без змін).
2. Trips report rows → `trip_segments`.
3. Trips report stats → нові поля `daily_trips`.
4. Rolling → `rolling_1000km_*`.
5. `raw_report_stats`: `{ fuel, trips, warnings, countriesVisited }`.

**Не змінено:** `parking_count` (з fuel report), паливні метрики, anomaly/baseline.

**TODO у коді:** точний час/км понад 86 км/г потребує окремого Wialon report або raw GPS (зараз лише прапорець `max_speed_kmh > 86`).

### 5. Derived pauses (не в БД)

Файл: `src/analytics/inferred-pauses.ts`

Паузи між рейсами: `prev.ended_at` → `next.started_at`.  
Тип `InferredPause` з `kind: "inferred"`.  
Обчислюється в API, не зберігається — це **не** Wialon raw parking rows.

### 6. API

`GET /api/reports/daily?date=YYYY-MM-DD`

- Auth: Supabase session (`requireUser`).
- `summary`: пробіг, паливо, рух, стоянки, авто з max>86, avg rolling л/100.
- `trips[]`: розширені поля + `speedLimitExceeded` + `derivedPauses`.

### 7. UI

`src/app/page.tsx` — табличний перегляд:

- KPI по флоту;
- таблиця машин (рух, стоянки, Vсер/макс, rolling, ДУТ, ⚠ при >86);
- деталі: рейси за добу + обчислені паузи.

### 8. Тести

| Файл | Що покриває |
|------|-------------|
| `tests/unit/duration.test.ts` | `N days HH:MM:SS` |
| `tests/unit/trips-stats-parser.test.ts` | label-based trips stats |
| `tests/unit/rolling-fuel.test.ts` | rolling 1000 км |

Перевірки: `npm run typecheck` OK, `npm test` 55/55 OK.

---

## Потік даних

```
Wialon (backend only)
  ├── Fuel report (template env)  → daily_trips (паливо, anomaly)
  └── Trips report template 11    → trip_segments (rows)
                                  → daily_trips (movement, parking, rolling)

Supabase
  └── GET /api/reports/daily → page.tsx
```

---

## Структура даних (Supabase)

### `vehicles`

Довідник машин. Ключ для ingest: `wialon_unit_id`.

### `ingestion_runs`

Один запис на `job_name` + `report_date`. Lock для ідемпотентного cron/CLI.

| Поле | Опис |
|------|------|
| `status` | `running` / `completed` / `partial` / `failed` |
| `expected_vehicles`, `successful_vehicles`, `failed_vehicles` | Прогрес job |
| `error_summary` | JSON помилок (sanitized) |

### `daily_trips`

**Один рядок на машину на business-дату.**  
Unique: `(vehicle_id, report_date)`.

#### Ідентифікація та інтервал

| Поле | Тип | Джерело |
|------|-----|---------|
| `vehicle_id` | uuid | vehicles |
| `ingestion_run_id` | uuid | ingestion_runs |
| `report_date` | date | business date |
| `interval_start`, `interval_end` | timestamptz | business day window |

#### Пробіг і швидкість

| Поле | Джерело |
|------|---------|
| `mileage_km`, `urban_mileage_km`, `highway_mileage_km`, `highway_ratio` | Fuel report (authoritative) |
| `max_speed_kmh`, `average_speed_kmh` | Fuel report |
| `movement_duration_seconds` | **Trips stats** |
| `stop_count` | **Trips stats** |
| `parking_duration_seconds` | **Trips stats** |
| `parking_count_from_trips` | **Trips stats** |
| `parking_count` | Fuel report (legacy, anomaly) |

#### Паливо

| Поле | Джерело |
|------|---------|
| `starting_fuel_l`, `ending_fuel_l`, `fuel_consumed_l` | Fuel report |
| `average_fuel_consumption_l_per_100km` | Fuel report |
| `refill_count`, `refilled_l`, `drain_count`, `drained_l` | Fuel report |

#### Rolling 1000 км

| Поле | Опис |
|------|------|
| `rolling_1000km_distance_km` | Сума пробігу сегментів у вікні |
| `rolling_1000km_fuel_l` | Сума палива сегментів |
| `rolling_1000km_consumption_l_per_100km` | л/100 км |

#### Маршрут і аномалії

| Поле | Опис |
|------|------|
| `route_tag`, `route_key` | Класифікатор маршруту з segments |
| `start_*`, `end_*` | Країна/місто/адреса |
| `baseline_*`, `deviation_percent`, `anomaly_status`, `is_anomaly` | Fuel anomaly |

#### Raw

| Поле | Структура |
|------|-----------|
| `raw_report_stats` | `{ fuel: [...], trips: [...], warnings: [...], countriesVisited: [...] }` |

### `trip_segments`

Окремі рейси/поїздки за добу.  
Unique: `(daily_trip_id, source_table_index, source_row_number)`.

| Поле | Джерело |
|------|---------|
| `started_at`, `ended_at`, `duration_seconds` | Trips report rows |
| `mileage_km`, urban/highway, speeds, fuel per segment | Trips report rows |
| `start_*`, `end_*` coords/address | Trips report rows |
| `segment_type` | завжди `"trip"` |
| `is_local_maneuver` | route classifier |
| `raw_row` | повний Wialon row |

### `fuel_events`

Заправки/зливи з fuel chronology.

| Поле | Опис |
|------|------|
| `event_type` | `refill` / `drain` |
| `event_time`, `volume_l` | час і об'єм |
| `latitude`, `longitude`, `address` | локація |

---

## API response (read model)

### `GET /api/reports/daily`

```json
{
  "summary": {
    "reportDate": "2026-06-14",
    "vehicleCount": 12,
    "totalMileageKm": 4520.5,
    "totalFuelL": 1180.3,
    "totalMovementSeconds": 86400,
    "totalParkingCount": 45,
    "totalParkingSeconds": 28800,
    "vehiclesOverSpeedLimit": 2,
    "averageRollingConsumptionLPer100Km": 28.5,
    "withRoute": 10,
    "withSegments": 11
  },
  "trips": [
    {
      "id": "uuid",
      "report_date": "2026-06-14",
      "mileage_km": 420.5,
      "fuel_consumed_l": 115.2,
      "movement_duration_seconds": 28800,
      "stop_count": 5,
      "parking_duration_seconds": 7200,
      "parking_count_from_trips": 3,
      "max_speed_kmh": 92,
      "average_speed_kmh": 68,
      "rolling_1000km_consumption_l_per_100km": 27.8,
      "speedLimitExceeded": true,
      "vehicle": { "display_name": "...", "tractor_number": "...", "wialon_unit_id": 123 },
      "segments": [ "..." ],
      "derivedPauses": [
        {
          "kind": "inferred",
          "startedAt": "2026-06-14T10:00:00Z",
          "endedAt": "2026-06-14T10:45:00Z",
          "durationSeconds": 2700
        }
      ]
    }
  ]
}
```

`derivedPauses` **не** зберігаються в БД — лише в API response.

---

## Змінені / нові файли

| Файл | Зміна |
|------|-------|
| `supabase/migrations/003_daily_trips_fleet_metrics.sql` | нова міграція |
| `src/utils/duration.ts` | `N days HH:MM:SS` |
| `src/wialon/parsers/trips-report.ts` | trips stats parser |
| `src/analytics/rolling-fuel.ts` | rolling helper |
| `src/analytics/inferred-pauses.ts` | derived pauses |
| `src/db/trips-repository.ts` | типи, queries, SELECT |
| `src/jobs/process-vehicle.ts` | ingest нових полів |
| `src/app/api/reports/daily/route.ts` | API shape |
| `src/app/page.tsx` | UI |
| `tests/unit/duration.test.ts` | +cases |
| `tests/unit/trips-stats-parser.test.ts` | новий |
| `tests/unit/rolling-fuel.test.ts` | новий |

---

## Деплой і backfill

1. Застосувати в Supabase SQL Editor: `003_daily_trips_fleet_metrics.sql`
2. Re-ingest за потрібні дати:

```bash
npm run ingest:date -- --date=2026-06-14 --force
npm run ingest:range -- --from=2026-06-01 --to=2026-06-14 --force
```

3. Перевірити UI: `http://localhost:3000` з тією ж датою.

---

## Обмеження

| Тема | Статус |
|------|--------|
| Перевищення 86 км/г | Лише прапорець по `max_speed_kmh`; час/км понад ліміт — окремий report |
| Стоянки з точним часом від Wialon | Не в ingest; UI показує inferred pauses між segments |
| `parking_count` vs `parking_count_from_trips` | Різні джерела (fuel vs trips); в UI — trips |
| Старі дані без re-ingest | Нові колонки `null` / `0` |
| Lint | `npm run lint` падає через `.next/` (не частина цієї задачі) |
