# Fleet Analytics and Automation

Production-ready MVP for daily fleet ingestion from Moniterra/Wialon,
normalization into Supabase, fuel anomaly detection, and Telegram reporting.

## Architecture

- **Next.js App Router** on Node.js runtime
- **Daily finalization + background ingestion queue** with idempotent Supabase writes
- **Wialon Remote API Reports** per vehicle (fuel + trips)
- **One `sid` per worker**; reports run sequentially inside each worker
- **Bounded concurrency** (default 4 workers)
- **Dynamic fuel baseline** from historical `daily_trips`
- **Telegram HTML summary** after ingestion

Manual-first workflow is supported before enabling Vercel Cron.

## Wialon lifecycle

```text
token/login -> report/exec_report -> get_report_status (poll)
-> apply_report_result -> select_result_rows -> cleanup_result -> core/logout
```

Only one report result may exist per `sid` session at a time.
Never run `Promise.all` for all vehicles on one `sid`.

## Setup

```bash
npm install
cp .env.example .env
```

Fill `.env` with Wialon, Supabase service role, and Telegram credentials.

### Wialon auth

Remote API uses **only** `WIALON_TOKEN` (72-char access token):

```text
svc=token/login
params={"token":"<WIALON_TOKEN>"}
```

`WIALON_USER` / `WIALON_PASSWORD` are **not** used by this app. Use them only
in Moniterra UI to create a token for the API user:

1. Log in to Moniterra as the user with fleet + report rights.
2. Open token management (or `login.html` OAuth flow per Wialon SDK).
3. Create token with access to units and reports on resource `2217`.
4. Paste the token into `WIALON_TOKEN` in `.env`.

Verify:

```bash
npm run integrations:test
```

Expected: `"wialonUser":"..."` and `"wialonUnitAccess":6221`.

Apply SQL migrations in Supabase SQL Editor:

1. `supabase/migrations/001_initial_schema.sql` (if not already applied)
2. `supabase/migrations/002_trip_segments_metrics.sql`
3. `supabase/migrations/003_daily_trips_fleet_metrics.sql`
4. `supabase/migrations/004_date_range_ingestion_queue.sql`

## Scripts

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run integrations:test
npm run ingest:date -- --date=2026-06-14
npm run ingest:date -- --date=2026-06-14 --send-telegram
npm run ingest:date -- --date=2026-06-14 --force
npm run ingest:range
```

Backfill за багато днів: див. [04-backfill-ingest-guide.md](04-backfill-ingest-guide.md).

`integrations:test` checks Supabase connectivity and Wialon login without printing secrets.

## Telegram

Use `--send-telegram` only when you want a message for manual runs.
Cron route sends Telegram automatically in production.

## Vercel deploy

1. Create Vercel project and import repository.
2. Generate cron secret:

```bash
openssl rand -hex 32
```

3. Add environment variables from `.env.example` in Vercel.
4. Apply all SQL files from `supabase/migrations`, including
   `004_date_range_ingestion_queue.sql`.
5. Deploy. `vercel.json` defines only daily finalization at `0 4 * * *` UTC.
6. The cron route uses the header:

```text
Authorization: Bearer <CRON_SECRET>
```

**Note:** Processing 24 vehicles needs `maxDuration=300` (Vercel Pro).
Range imports are started manually from the dashboard button.

## Retry partial/failed dates

```bash
npm run ingest:date -- --date=YYYY-MM-DD --force
```

`ingestion_runs` and `ingestion_queue` prevent duplicate concurrent runs.
Completed final dates are skipped unless `--force`.

## Current limitations

- No driver data in `.Поездки` report
- Geofences report is not used
- Refill/drain parser is defensive; real fixtures still needed
- 24 vehicles within 300s on Vercel is tight; validate with load test
