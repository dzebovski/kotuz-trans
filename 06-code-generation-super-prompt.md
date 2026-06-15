# Super Prompt: Fleet Analytics and Automation System

Скопіюй весь текст нижче в coding agent. Agent повинен не лише описати
рішення, а створити повністю робочий проєкт, запустити перевірки та
підготувати його до деплою на Vercel.

---

## Роль

Ти Senior Backend Engineer, Solutions Architect і DevOps Engineer.

Побудуй production-ready MVP системи **Fleet Analytics and Automation**
на Next.js/Node.js для розгортання на Vercel.

Працюй без зайвих пояснень. Спочатку проаналізуй наявні файли
репозиторію, потім створи код, тести, конфігурацію і документацію.
Не зупиняйся на плані.

## Головна мета

Один раз на добу система повинна:

1. Отримати всі активні автомобілі з Supabase.
2. Для кожного автомобіля виконати два Wialon Reports:
   - `.Отчет по топливу`;
   - `.Поездки`.
3. Нормалізувати добову статистику і рядки окремих поїздок.
4. Класифікувати маршрут за країнами, містами та хронологією.
5. Знайти історичний baseline для цього автомобіля і типу маршруту.
6. Виявити аномально високу витрату пального.
7. Ідемпотентно записати результати в Supabase.
8. Надіслати один підсумковий звіт у Telegram.

## Жорсткі інфраструктурні обмеження

- Hosting: Vercel.
- Framework: актуальна стабільна версія Next.js з App Router.
- Runtime: Node.js, не Edge.
- Language: TypeScript зі `strict: true`.
- Package manager: npm.
- Database: Supabase PostgreSQL.
- Notification: Telegram Bot API.
- Джерело даних: Moniterra/Wialon Remote API Reports.
- Має бути рівно **один Vercel Cron Job**, один раз на день.
- Cron path:

```text
/api/cron/daily-fleet-report
```

- Cron schedule:

```text
0 4 * * *
```

Це 04:00 UTC. Job завжди обробляє попередній календарний день у
`BUSINESS_TIMEZONE=Europe/Kyiv`.

- Для Cron Route Handler встановити:

```ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
```

- Не створювати додаткових scheduled jobs.
- Не використовувати background streaming, queues або raw GPS streaming.
- Не будувати dashboard у цьому MVP. Достатньо мінімальної status page
  і health endpoint.

## Важлива архітектурна умова Wialon

В одній Wialon `sid`-сесії одночасно може існувати результат лише одного
звіту.

Категорично заборонено:

```text
one sid -> Promise.all(all vehicles)
```

Правильна модель:

- окремий worker для кожного автомобіля;
- кожен worker створює власну `sid`;
- усередині worker звіти виконуються послідовно;
- після кожного звіту обов'язково викликається `cleanup_result`;
- наприкінці worker обов'язково викликається `core/logout`;
- одночасно працює обмежена кількість worker;
- default concurrency: `4`;
- concurrency має налаштовуватися через env;
- паралельність реалізувати через bounded concurrency і
  `Promise.allSettled`, а не необмежений `Promise.all`.

Група Wialon існує:

```text
name: Брокінвест Групп, ТОВ
group ID: 2218
```

Але доступні шаблони звітів працюють тільки з окремим Unit. Group ID
використовується лише як довідкова інформація, не для report execution.

## Підтверджена Wialon конфігурація

```text
API URL:
https://moniterra.services/wialon/ajax.html

Report resource ID:
2217

Fuel template:
ID 5
Name .Отчет по топливу

Trips template:
ID 11
Name .Поездки

Geofences template:
ID 1
Name Геозоны

reportObjectSecId:
0

Execution:
remoteExec = 1
```

`Геозоны` за перевірений день повернув порожні `stats` і `tables`.
Не викликай geofences report у daily job. Route tagging має працювати
за адресами та координатами зі звіту `.Поездки`.

## Формат HTTP-запитів Wialon

Використовуй:

```text
POST {WIALON_API_URL}?svc={service}
Content-Type: application/x-www-form-urlencoded
```

Body створюй через `URLSearchParams`:

```text
params=<JSON string>
sid=<session id, якщо потрібен>
```

Не передавай token або sid у query string, логах чи текстах помилок.

## Wialon lifecycle

### Авторизація

```text
svc=token/login
params={"token":"<WIALON_TOKEN>"}
```

У відповіді:

```text
eid = sid
```

### Виконання кожного звіту

```text
report/exec_report
report/get_report_status
report/apply_report_result
report/select_result_rows
report/cleanup_result
```

Статуси asynchronous report:

```text
1  waiting
2  running
4  ready
8  canceled
16 error or report not found
```

Polling:

- interval: приблизно 1500 ms;
- timeout одного report lifecycle: приблизно 60 seconds;
- поважати загальний deadline Cron;
- статус `4` означає, що можна викликати `apply_report_result`;
- `8`, `16`, unknown status або timeout мають повертати typed error.

У `finally`:

1. Спробувати `report/cleanup_result`, якщо report був запущений.
2. Після завершення worker викликати `core/logout`.
3. Cleanup/logout errors логувати, але не перекривати основну помилку.

## Інтервал звіту

Не використовуй UI-relative flags `16777218` у production.

Для потрібної `report_date`:

1. Побудуй `00:00:00` і `23:59:59` у `Europe/Kyiv`.
2. Перетвори їх у UNIX seconds.
3. Передай:

```json
{
  "flags": 0,
  "from": 1781384400,
  "to": 1781470799
}
```

Числа вище лише приклад. Реальні timestamps обчислюються динамічно.

Для timezone використовуй бібліотеку з підтримкою IANA zones, наприклад
`luxon`. Обов'язково протестуй перехід DST.

## Payload `exec_report`

```json
{
  "reportResourceId": 2217,
  "reportTemplateId": 5,
  "reportTemplate": null,
  "reportObjectId": 6221,
  "reportObjectSecId": 0,
  "interval": {
    "flags": 0,
    "from": 0,
    "to": 0
  },
  "remoteExec": 1
}
```

Template ID змінюється залежно від звіту.

## Звіт `.Отчет по топливу`

### Добова статистика

Парсер має мапити labels, а не покладатися на порядок рядків:

```text
Пробег в поездках
Городской пробег в поездках
Загородный пробег в поездках
Макс. скорость в поездках
Средняя скорость в поездках
Нач. уровень
Конеч. уровень
Всего заправок
Всего заправлено
Всего сливов
Всего топлива слито
Потрачено по ДУТ
Ср. расход по ДУТ (пробег по детектору поездок)
Количество стоянок
```

Вхідні значення можуть бути:

```text
391 km
12.16 km
93 km/h
107 l
27.42 l/100 km
```

Створи reusable parser чисел та одиниць:

- підтримка `.` і `,` як decimal separator;
- whitespace;
- JSON cell може бути string або object з полем `t`;
- невідомий label не повинен ламати весь report;
- raw stats завжди зберігати в `raw_report_stats`.

### Fuel chronology

Підтверджена таблиця:

```text
tableIndex = 0
name = unit_chronology
label = Хронология по топливу
level = 1
columns = 8
```

Мапінг:

```text
c[0] type
c[1] start time and coordinates
c[2] end time and coordinates
c[3] duration
c[4] start address and coordinates
c[5] end address and coordinates
c[6] description
c[7] notes
```

Не потрібно завжди завантажувати chronology. Викликай
`select_result_rows` для fuel report тільки якщо статистика показує
заправку або злив.

Формат реальних refill/drain rows ще не підтверджений. Реалізуй
defensive parser:

- розпізнавати поширені російські та англійські назви refill/drain;
- зберігати raw row;
- якщо event type або volume неможливо надійно визначити, пропустити
  normalized event і записати warning;
- не вигадувати volume;
- core daily job не повинен падати через unknown fuel event.

## Звіт `.Поездки`

Підтверджена таблиця:

```text
template ID = 11
tableIndex = 0
name = unit_trips
label = Поездки
level = 1
columns = 17
```

Мапінг рядка `c`:

```text
c[0]  start time and coordinates
c[1]  start address and coordinates
c[2]  end time and coordinates
c[3]  end address and coordinates
c[4]  trip duration
c[5]  total duration
c[6]  mileage
c[7]  average fuel consumption by FLS
c[8]  urban mileage
c[9]  highway/suburban mileage
c[10] absolute mileage at start
c[11] absolute mileage at end
c[12] average speed
c[13] maximum speed and coordinates
c[14] consumed fuel by FLS
c[15] starting fuel level
c[16] ending fuel level
```

Підтверджений fixture:

```text
Vehicle: unit ID 6221
Date: 2026-06-14

Segment 1:
De Lutte, Netherlands -> Hoogstraten, Belgium
231 km
urban 4.62 km
highway 226 km
28.82 l/100 km
66 l

Segment 2:
Hoogstraten, Belgium -> Oostende, Belgium
161 km
urban 7.54 km
highway 153 km
26.17 l/100 km
42.01 l
```

`select_result_rows`:

```json
{
  "tableIndex": 0,
  "config": {
    "type": "range",
    "data": {
      "from": 0,
      "to": 499,
      "level": 1,
      "flat": 1,
      "rawValues": 1,
      "unitInfo": 1
    }
  }
}
```

Якщо rows більше 500, завантажуй сторінками.

## Узгодження двох звітів

Authoritative daily aggregate:

1. Паливний report є основним джерелом добової статистики, refill і drain.
2. Trips report є основним джерелом сегментів маршруту.
3. Якщо fuel report не виконався, але trips report виконався, дозволено
   зберегти partial result з trips statistics.
4. Якщо mileage/fuel між reports відрізняється менше ніж на 5%, це
   warning через округлення, не error.
5. Якщо розбіжність більша за 5%, додати data quality warning у raw
   metadata і не створювати false anomaly без достатньо надійних даних.

Приклад округлення:

```text
231 km + 161 km = 392 km
точний daily mileage = 391.159 km
```

Не сумуй округлені segment mileage як authoritative daily mileage.

## Route classification

Route classifier має бути deterministic і unit-tested.

### Local maneuvers

- сегмент менше `2 km` позначити `is_local_maneuver=true`;
- такі сегменти зберігати;
- не використовувати їх як початкову/кінцеву точку route key, якщо є
  довші сегменти;
- якщо всі сегменти короткі, побудувати route з доступних даних.

### Country normalization

Нормалізувати щонайменше:

```text
Ukraine -> UA
Poland -> PL
Germany -> DE
Netherlands -> NL
Belgium -> BE
France -> FR
United Kingdom / UK / England -> GB
Italy -> IT
Spain -> ES
Czechia / Czech Republic -> CZ
Slovakia -> SK
Austria -> AT
Hungary -> HU
Romania -> RO
Lithuania -> LT
Latvia -> LV
Estonia -> EE
```

Залишати raw address навіть якщо нормалізація не вдалася.

### Route key

Формат:

```text
{START_COUNTRY}:{START_CITY_SLUG}>{END_COUNTRY}:{END_CITY_SLUG}
```

Приклади:

```text
GB:CANTERBURY>BE:NIVELLES
NL:DE_LUTTE>BE:OOSTENDE
```

### Route tag

Мінімальні правила:

```text
same country:
{CC}_INTERNAL

GB plus another European country:
UK_EU_INTERNATIONAL

UA plus another country:
UA_INTERNATIONAL

two or more other European countries:
EU_INTERNATIONAL

country unresolved:
UNKNOWN
```

Зберігати список відвіданих країн у raw metadata.

## Supabase

Supabase schema вже розгорнута. Вона містить:

```text
vehicle_groups
vehicles
ingestion_runs
daily_trips
trip_segments
fuel_events
```

У `vehicles` уже є 24 активні автомобілі.

Використовуй `@supabase/supabase-js` тільки на сервері з
`SUPABASE_SERVICE_ROLE_KEY`.

Ніколи не імпортуй service role client у client component.

### Основні database contracts

`vehicles`:

```text
id uuid
wialon_unit_id bigint unique
display_name text
tractor_number text
trailer_number text nullable
is_active boolean
```

`ingestion_runs`:

```text
id uuid
job_name text
report_date date
status running|completed|partial|failed
expected_vehicles integer
successful_vehicles integer
failed_vehicles integer
started_at timestamptz
heartbeat_at timestamptz
completed_at timestamptz nullable
error_summary jsonb
metadata jsonb
unique(job_name, report_date)
```

`daily_trips` має:

```text
vehicle_id
ingestion_run_id
report_date
interval_start
interval_end
mileage_km
urban_mileage_km
highway_mileage_km
highway_ratio
max_speed_kmh
average_speed_kmh
parking_count
starting_fuel_l
ending_fuel_l
fuel_consumed_l
average_fuel_consumption_l_per_100km
refill_count
refilled_l
drain_count
drained_l
route_tag
route_key
start_country_code
start_city
start_address
end_country_code
end_city
end_address
baseline_scope
baseline_sample_size
baseline_average_l_per_100km
baseline_stddev_l_per_100km
deviation_percent
anomaly_status
is_anomaly
raw_report_stats
unique(vehicle_id, report_date)
```

`trip_segments` уже підтримує trip-level:

```text
mileage_km
urban_mileage_km
highway_mileage_km
average_fuel_consumption_l_per_100km
fuel_consumed_l
average_speed_kmh
max_speed_kmh
starting_fuel_l
ending_fuel_l
addresses
coordinates
raw_row
```

### Idempotency

- `daily_trips`: upsert по `vehicle_id,report_date`.
- `trip_segments`: upsert по
  `daily_trip_id,source_table_index,source_row_number`.
- Перед upsert сегментів видалити stale rows для цього `daily_trip_id`,
  яких більше немає в новому result.
- `fuel_events`: upsert за існуючим unique constraint.
- Повторний запуск не повинен дублювати дані.

### Cron lock

Використай `ingestion_runs` як distributed lock:

1. Спробуй insert `(job_name, report_date, status=running)`.
2. Якщо unique conflict:
   - `completed` -> повернути already processed;
   - `running` зі свіжим heartbeat -> не запускати другий job;
   - `failed`, `partial` або stale `running` -> дозволити retry через
     atomic compare-and-set update.
3. Stale threshold: 15 minutes.
4. Оновлюй heartbeat після кожного batch.
5. Наприкінці status:
   - `completed`: усі авто успішні;
   - `partial`: частина авто не оброблена;
   - `failed`: жодне авто не оброблено або сталася fatal error.

Vercel Cron може доставити одну подію повторно, тому потрібні одночасно
lock та idempotent writes.

## Dynamic fuel baseline

Baseline рахується перед upsert поточного дня, щоб поточний запис не
потрапив у власну історію.

Eligibility:

- той самий `vehicle_id`;
- history strictly before current `report_date`;
- lookback: default `120` days;
- mileage не менше `20 km`;
- consumption не null;
- `is_anomaly=false`;
- highway ratio у межах current ratio ± `0.10`;
- clamp ratio range до `0..1`.

Priority:

1. exact `route_key`;
2. fallback same `route_tag`.

Minimum samples:

```text
5
```

Якщо sample size менше 5:

```text
anomaly_status = insufficient_history
is_anomaly = false
```

Обчислити:

```text
average
median
sample standard deviation
deviation_percent =
  (actual_consumption - baseline_average) / baseline_average * 100
```

Thresholds мають бути configurable:

```text
warning:
actual > max(baseline_average * 1.15, baseline_average + 1.5 * stddev)

critical:
actual > max(baseline_average * 1.25, baseline_average + 2 * stddev)
```

Правила:

- alert тільки для перевитрати, не для нижчої витрати;
- якщо baseline average <= 0, anomaly не оцінювати;
- data quality warning може вимкнути anomaly evaluation;
- зберегти scope, sample size, average, stddev і deviation percent.

Створи pure functions для baseline та anomaly evaluation і покрий
unit tests.

## Telegram report

Використовуй:

```text
POST https://api.telegram.org/bot{TOKEN}/sendMessage
```

Payload:

```json
{
  "chat_id": "<TELEGRAM_CHAT_ID>",
  "text": "<HTML>",
  "parse_mode": "HTML",
  "disable_web_page_preview": true
}
```

Якщо `TELEGRAM_THREAD_ID` заданий, додай `message_thread_id`.

Обов'язково:

- escape HTML;
- не перевищувати Telegram message limit;
- chunk довгі повідомлення приблизно по 3500 символів;
- retry transient `429` і `5xx`;
- враховувати `retry_after`, якщо Telegram його повернув.

### Message layout

```text
Fleet report — YYYY-MM-DD

Fleet summary
Processed: 23/24
Mileage: 5,430 km
Fuel consumed: 1,420 l
Average consumption: 26.15 l/100 km
Refills: 3 / 820 l
Drains: 0

Top efficient vehicles
1. KA... — 22.4 l/100 km, -11.2% vs baseline
2. ...

Critical alerts
KA... — 34.8 l/100 km
Baseline: 26.1
Deviation: +33.3%
Route: NL:ROTTERDAM>BE:ANTWERP
Highway: 94%

Processing issues
1 vehicle failed: unit 1234 — report timeout
```

Водії:

- шаблон `.Поездки` не містить driver ID/name;
- не вигадуй ranking водіїв;
- для MVP показуй `Top efficient vehicles`;
- поля driver у schema залишаються для майбутнього джерела.

Якщо немає baseline history, Top efficient vehicles можна формувати
серед авто з mileage >= 50 km за найнижчою фактичною витратою, але
позначити це як ranking без baseline.

Telegram error не повинен відкотити вже записані Supabase data.
Job status/metadata має зафіксувати помилку Telegram.

## Cron security

Route приймає лише `GET`.

Перевір:

```text
Authorization: Bearer <CRON_SECRET>
```

Вимоги:

- якщо `CRON_SECRET` відсутній, fail closed;
- якщо header неправильний, повернути `401`;
- не підтримувати secret у query parameter;
- не логувати header;
- порівняння зробити без небезпечного витоку;
- success response має бути JSON;
- не робити redirect.

`CRON_SECRET` буде згенерований перед deploy:

```bash
openssl rand -hex 32
```

## Deadline та resilience

Job повинен знати власний deadline:

- max Vercel duration: 300 seconds;
- internal soft deadline: приблизно 270 seconds;
- не запускати новий vehicle worker після soft deadline;
- незапущені автомобілі позначити failed з причиною `deadline`;
- все одно завершити ingestion run і спробувати Telegram partial report.

HTTP timeout:

- кожен fetch через `AbortController`;
- default request timeout 15 seconds;
- report lifecycle timeout окремий;
- retry лише network errors, `429`, `502`, `503`, `504`;
- exponential backoff + jitter;
- максимум 2 retries;
- не retry deterministic Wialon validation/auth errors.

Failure одного vehicle не зупиняє інші.

## Environment variables

Створи validated server-only env module через `zod`.

Required:

```text
WIALON_API_URL
WIALON_TOKEN
WIALON_REPORT_RESOURCE_ID
WIALON_FUEL_REPORT_TEMPLATE_ID
WIALON_TRIPS_REPORT_TEMPLATE_ID
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
TELEGRAM_BOT_TOKEN
TELEGRAM_CHAT_ID
BUSINESS_TIMEZONE
```

Required only by Cron route in production:

```text
CRON_SECRET
```

Optional/default:

```text
WIALON_GEOFENCES_REPORT_TEMPLATE_ID=1
TELEGRAM_THREAD_ID=
WIALON_CONCURRENCY=4
WIALON_REQUEST_TIMEOUT_MS=15000
WIALON_REPORT_TIMEOUT_MS=60000
WIALON_POLL_INTERVAL_MS=1500
BASELINE_LOOKBACK_DAYS=120
BASELINE_MIN_SAMPLES=5
BASELINE_HIGHWAY_TOLERANCE=0.10
ANOMALY_WARNING_PERCENT=15
ANOMALY_CRITICAL_PERCENT=25
LOCAL_MANEUVER_MAX_KM=2
```

Створи `.env.example` без secret values.

Ніколи не використовуй `NEXT_PUBLIC_` для секретів.

## Рекомендована структура

```text
app/
  api/
    cron/
      daily-fleet-report/
        route.ts
    health/
      route.ts
  page.tsx
  layout.tsx

src/
  config/
    env.ts
  jobs/
    run-daily-fleet-report.ts
    process-vehicle.ts
  wialon/
    client.ts
    errors.ts
    types.ts
    report-runner.ts
    parsers/
      common.ts
      fuel-report.ts
      trips-report.ts
      fuel-events.ts
  analytics/
    route-classifier.ts
    country-normalizer.ts
    baseline.ts
    anomaly.ts
    fleet-summary.ts
  db/
    supabase-admin.ts
    vehicles-repository.ts
    ingestion-runs-repository.ts
    trips-repository.ts
    analytics-repository.ts
  telegram/
    client.ts
    formatter.ts
  utils/
    concurrency.ts
    retry.ts
    timeout.ts
    time.ts
    numbers.ts
    duration.ts
    html.ts
    logger.ts

scripts/
  test-integrations.ts
  run-daily.ts

tests/
  fixtures/
    fuel-report-3764-2026-06-11.json
    fuel-report-6221-2026-06-14.json
    trips-report-6221-2026-06-14.json
  unit/
  integration/

supabase/
  migrations/
    001_initial_schema.sql

vercel.json
README.md
```

Можеш трохи скорегувати структуру, якщо це покращить cohesion, але
не змішуй API transport, parsing, analytics і persistence в одному файлі.

## Manual scripts

Створи:

```text
npm run integrations:test
npm run ingest:date -- --date=YYYY-MM-DD
npm run ingest:date -- --date=YYYY-MM-DD --send-telegram
```

Вимоги:

- scripts читають локальний `.env`;
- `ingest:date` обробляє конкретну business date;
- без `--send-telegram` повідомлення не відправляється;
- `--force` дозволяє явно повторити completed date;
- script output не містить token, sid або service role key.

Не створюй публічний manual ingestion endpoint.

## Health endpoint

```text
GET /api/health
```

Повертає:

```json
{
  "status": "ok",
  "service": "fleet-analytics",
  "timestamp": "..."
}
```

Не повертай env values і не виконуй важкі Wialon calls.

## Logging

Structured logs:

```json
{
  "level": "info",
  "event": "vehicle_processed",
  "reportDate": "2026-06-14",
  "wialonUnitId": 6221,
  "durationMs": 12345
}
```

Заборонені поля:

```text
token
sid
authorization
cookie
service role key
Telegram bot token
```

Error summaries у `ingestion_runs` мають бути короткими й sanitized.

## Tests

Використай Vitest.

Обов'язкові unit tests:

1. parsing formatted number/unit values;
2. parsing fuel stats by label;
3. parsing 17-column `unit_trips` rows;
4. duration parsing;
5. country normalization;
6. local maneuver filtering;
7. route key/tag:
   - Canterbury -> Nivelles;
   - De Lutte -> Oostende;
8. baseline exact route and fallback route tag;
9. insufficient history;
10. warning and critical anomaly thresholds;
11. Telegram HTML escaping/chunking;
12. Kyiv previous-day interval;
13. DST boundary;
14. Cron authorization;
15. idempotent result mapping.

Integration-style mocked tests:

1. Wialon login -> report polling -> apply -> select -> cleanup -> logout;
2. status `4`;
3. status `8`;
4. report timeout;
5. cleanup still called after parser error;
6. one failed vehicle does not fail the whole fleet;
7. duplicate Cron run does not duplicate daily data.

Не роби live external calls у звичайному `npm test`.

## Code quality

- TypeScript strict.
- ESLint.
- No `any`, окрім ізольованої boundary для unknown external JSON;
  після boundary дані валідовувати.
- Використовуй `unknown` + type guards/Zod.
- Pure parsers and analytics functions.
- Dependency injection для fetch/Supabase у tests.
- Не використовуй giant service class.
- Не створюй premature abstractions.
- Не приховуй errors порожніми catch blocks.
- Не додавай секрети у fixtures, snapshots, README або logs.
- Не використовуй raw string concatenation для form encoding.
- Не використовуй floating point equality у tests.

## README

README має містити:

1. Архітектуру.
2. Wialon lifecycle.
3. Чому потрібен окремий sid на worker.
4. Як встановити dependencies.
5. Як налаштувати `.env`.
6. Як запустити tests.
7. Як виконати dry run за конкретну дату.
8. Як перевірити Telegram.
9. Як deploy на Vercel.
10. Як створити `CRON_SECRET`.
11. Які env додати у Vercel.
12. Як перевірити Cron logs.
13. Як безпечно retry partial/failed date.
14. Поточні обмеження:
    - немає driver data;
    - geofences не використовуються;
    - refill/drain fixture ще потрібно зібрати.

## Vercel configuration

Створи `vercel.json` із рівно одним Cron:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "crons": [
    {
      "path": "/api/cron/daily-fleet-report",
      "schedule": "0 4 * * *"
    }
  ]
}
```

Не дублюй Cron configuration в інших файлах.

## Security acceptance criteria

- `.env*` у `.gitignore`, крім `.env.example`.
- Жодного secret value у git.
- Cron unauthorized request -> `401`.
- Supabase service role використовується лише server-side.
- Wialon token не логується.
- sid не логується і не зберігається в БД.
- Telegram token не логується.
- External API error body sanitization.
- RLS не вимикається.
- Public UI не має доступу до fleet raw data.

## Functional acceptance criteria

Проєкт готовий, коли:

1. `npm install` працює.
2. `npm run lint` проходить.
3. `npm run typecheck` проходить.
4. `npm test` проходить.
5. `npm run build` проходить.
6. Health endpoint працює.
7. Unauthorized Cron повертає `401`.
8. Fixture unit `6221` дає:
   - 391 km daily mileage;
   - 107 l;
   - 27.42 l/100 km;
   - route `NL:DE_LUTTE>BE:OOSTENDE`;
   - route tag `EU_INTERNATIONAL`;
   - 2 trip segments.
9. Повторна обробка тієї самої дати не створює дублікати.
10. Partial vehicle failure відображається в Telegram summary.
11. У коді немає TODO у critical path.
12. У Vercel configuration рівно один Cron.

## Порядок реалізації

1. Проаналізуй існуючі Markdown і SQL файли.
2. Ініціалізуй Next.js TypeScript project без видалення документації.
3. Додай env validation.
4. Реалізуй Wialon client і lifecycle.
5. Додай fixtures і parsers.
6. Реалізуй route classification.
7. Реалізуй Supabase repositories та idempotency.
8. Реалізуй baseline/anomaly logic.
9. Реалізуй Telegram formatter/client.
10. Реалізуй fleet job.
11. Реалізуй Cron route та health route.
12. Додай scripts.
13. Додай tests.
14. Додай `vercel.json`.
15. Онови README.
16. Запусти lint, typecheck, tests і production build.
17. Виправ усі помилки.

## Формат фінальної відповіді coding agent

Після завершення повідом коротко:

1. Що створено.
2. Які перевірки пройшли.
3. Які env ще потрібні.
4. Чи готовий проєкт до Vercel.
5. Які відомі обмеження залишилися.

Не повертай лише code snippets. Реально створи всі файли в workspace.

## Офіційні довідкові матеріали

- Wialon Reports:
  https://sdk.wialon.com/wiki/ru/local/remoteapi2304/apiref/report/report
- Wialon token login:
  https://sdk.wialon.com/wiki/ru/local/remoteapi2304/apiref/login/login
- Vercel Cron:
  https://vercel.com/docs/cron-jobs/manage-cron-jobs
- Vercel function duration:
  https://vercel.com/docs/functions/configuring-functions/duration
- Next.js Route Handlers:
  https://nextjs.org/docs/app/api-reference/file-conventions/route
