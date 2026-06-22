"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  Database,
  Fuel,
  Gauge,
  LayoutDashboard,
  ListTree,
  LogOut,
  Moon,
  RefreshCw,
  Route,
  Search,
  Sun,
  Truck,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type TripSegment = {
  id: string;
  started_at: string;
  ended_at: string;
  duration_seconds: number | null;
  mileage_km: number;
  fuel_consumed_l: number | null;
  average_speed_kmh: number | null;
  max_speed_kmh: number | null;
  start_address: string | null;
  end_address: string | null;
  is_local_maneuver: boolean;
};

type InferredPause = {
  kind: "inferred";
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
};

type DailyTrip = {
  id: string;
  mileage_km: number;
  fuel_consumed_l: number | null;
  average_fuel_consumption_l_per_100km: number | null;
  route_key: string | null;
  anomaly_status: string;
  movement_duration_seconds: number | null;
  stop_count: number;
  parking_duration_seconds: number | null;
  parking_count_from_trips: number;
  max_speed_kmh: number | null;
  average_speed_kmh: number | null;
  starting_fuel_l: number | null;
  ending_fuel_l: number | null;
  rolling_1000km_consumption_l_per_100km: number | null;
  speedLimitExceeded: boolean;
  vehicle: {
    display_name: string;
    wialon_unit_id: number;
  };
  segments: TripSegment[];
  derivedPauses: InferredPause[];
};

type ReportResponse = {
  summary: {
    reportDate: string;
    vehicleCount: number;
    totalMileageKm: number;
    totalFuelL: number;
    totalMovementSeconds: number;
    totalParkingCount: number;
    totalParkingSeconds: number;
    vehiclesOverSpeedLimit: number;
    averageRollingConsumptionLPer100Km: number | null;
    withRoute: number;
    withSegments: number;
  };
  trips: DailyTrip[];
  ingestion: {
    status: "running" | "completed" | "partial" | "failed" | null;
    successfulVehicles: number;
    failedVehicles: number;
    processedVehicles: number;
    expectedVehicles: number;
    startedAt: string | null;
    heartbeatAt: string | null;
    completedAt: string | null;
    phase: "starting" | "processing" | "finalizing" | null;
    currentVehicles: Array<{
      wialonUnitId: number;
      displayName: string;
    }>;
    hasData: boolean;
  };
};

type IngestionResponse = {
  ok: boolean;
  status: "completed" | "partial" | "failed" | "skipped";
  reportDate: string;
  reason?: string;
  processed: number;
  expected: number;
};

type ThemeMode = "light" | "dark";

const THEME_STORAGE_KEY = "fleet-dashboard-theme";
const BUSINESS_TIMEZONE = "Europe/Kyiv";
const INGESTION_POLL_INTERVAL_MS = 2_000;

const navItems = [
  { label: "Dashboard", href: "#overview", icon: LayoutDashboard },
  { label: "Vehicles", href: "#vehicles", icon: Truck },
  { label: "Trips", href: "#trips", icon: Route },
  { label: "Alerts", href: "#alerts", icon: AlertTriangle },
];

function formatNum(value: number | null, suffix = ""): string {
  if (value == null || Number.isNaN(value)) {
    return "-";
  }
  return `${value.toLocaleString("uk-UA", { maximumFractionDigits: 2 })}${suffix}`;
}

function formatDuration(seconds: number | null): string {
  if (seconds == null || seconds <= 0) {
    return "-";
  }
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours} год ${minutes} хв`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("uk-UA", {
    timeZone: "Europe/Kyiv",
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
  });
}

function formatDateLabel(date: string): string {
  const [year, month, day] = date.split("-");
  return `${day}.${month}.${year}`;
}

function formatElapsed(startedAt: string | null, now: number): string {
  if (!startedAt) {
    return "щойно";
  }
  const seconds = Math.max(
    0,
    Math.floor((now - new Date(startedAt).getTime()) / 1000),
  );
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return minutes > 0
    ? `${minutes} хв ${remainingSeconds} с`
    : `${remainingSeconds} с`;
}

function isAnomaly(status: string): boolean {
  return status === "warning" || status === "critical";
}

function isThemeMode(value: string | null): value is ThemeMode {
  return value === "light" || value === "dark";
}

function countryCodeToFlag(code: string): string {
  const normalized = code.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalized)) {
    return "";
  }
  return Array.from(normalized)
    .map((char) => String.fromCodePoint(char.charCodeAt(0) + 127397))
    .join("");
}

function routeFlags(routeKey: string | null): string {
  if (!routeKey) {
    return "-";
  }
  const codes = Array.from(routeKey.matchAll(/\b[A-Z]{2}(?=:)/g), (match) => match[0]);
  const routeCodes =
    codes.length === 1 ? [codes[0], codes[0]] : [codes[0], codes[codes.length - 1]];
  const flags = routeCodes.map(countryCodeToFlag).filter(Boolean);
  return flags.length > 0 ? flags.join(" → ") : "-";
}

function describeNonJsonResponse(status: number, body: string): string {
  const snippet = body
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);

  return snippet
    ? `API повернув HTML замість JSON (${status}): ${snippet}`
    : `API повернув HTML замість JSON (${status})`;
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  let json: (T & { error?: string }) | null = null;

  try {
    json = JSON.parse(text) as T & { error?: string };
  } catch {
    if (!response.ok) {
      throw new Error(describeNonJsonResponse(response.status, text));
    }
    throw new Error("API повернув невалідний JSON");
  }

  if (!response.ok) {
    throw new Error(json.error ?? `Failed to load report (${response.status})`);
  }

  return json;
}

function getKyivDate(offsetDays = 0): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const date = new Date(
    Date.UTC(
      Number(values.year),
      Number(values.month) - 1,
      Number(values.day) + offsetDays,
    ),
  );
  return date.toISOString().slice(0, 10);
}

function ingestionLabel(data: ReportResponse | null): string {
  const ingestion = data?.ingestion;
  if (!ingestion?.status) {
    return "Дані ще не завантажувалися";
  }
  if (ingestion.status === "running") {
    return "Завантаження виконується";
  }
  if (ingestion.status === "failed") {
    return "Останнє завантаження не вдалося";
  }

  const counts = `${ingestion.successfulVehicles}/${ingestion.expectedVehicles}`;
  return ingestion.status === "partial"
    ? `Завантажено частково: ${counts}`
    : `Завантажено: ${counts}`;
}

export default function HomePage() {
  const router = useRouter();
  const [date, setDate] = useState(() => getKyivDate(-1));
  const [data, setData] = useState<ReportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [ingesting, setIngesting] = useState(false);
  const [progressClock, setProgressClock] = useState(() => Date.now());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [vehicleQuery, setVehicleQuery] = useState("");
  const [theme, setTheme] = useState<ThemeMode>("dark");

  const load = useCallback(async (options: { silent?: boolean } = {}) => {
    if (!options.silent) {
      setLoading(true);
      setError(null);
    }
    try {
      const response = await fetch(`/api/reports/daily?date=${date}`);
      const json = await readJsonResponse<ReportResponse>(response);
      setData(json);
      return json;
    } catch (loadError) {
      if (!options.silent) {
        setData(null);
      }
      setError(
        loadError instanceof Error ? loadError.message : "Failed to load report",
      );
      return null;
    } finally {
      if (!options.silent) {
        setLoading(false);
      }
    }
  }, [date]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!ingesting && data?.ingestion.status !== "running") {
      return;
    }

    void load({ silent: true });
    const intervalId = window.setInterval(() => {
      void load({ silent: true });
    }, INGESTION_POLL_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [data?.ingestion.status, ingesting, load]);

  useEffect(() => {
    if (!ingesting && data?.ingestion.status !== "running") {
      return;
    }

    setProgressClock(Date.now());
    const intervalId = window.setInterval(() => {
      setProgressClock(Date.now());
    }, 1_000);

    return () => window.clearInterval(intervalId);
  }, [data?.ingestion.status, ingesting]);

  useEffect(() => {
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    const preferredTheme = window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
    const nextTheme = isThemeMode(storedTheme) ? storedTheme : preferredTheme;

    setTheme(nextTheme);
    document.documentElement.dataset.theme = nextTheme;
  }, []);

  function handleThemeToggle() {
    const nextTheme = theme === "dark" ? "light" : "dark";

    setTheme(nextTheme);
    document.documentElement.dataset.theme = nextTheme;
    window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
  }

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  function handleDateChange(nextDate: string) {
    setDate(nextDate);
    setData(null);
    setError(null);
    setExpandedId(null);
  }

  async function handleIngest() {
    const force = data?.ingestion.hasData ?? false;
    setIngesting(true);
    setError(null);

    try {
      const response = await fetch("/api/reports/daily", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ date, force }),
      });
      const result = await readJsonResponse<IngestionResponse>(response);

      if (result.status === "failed") {
        throw new Error("Не вдалося завантажити дані за вибрану дату");
      }

      await load({ silent: true });
    } catch (ingestError) {
      const latest = await load({ silent: true });
      const processStillRunning = latest?.ingestion.status === "running";
      setError(
        processStillRunning
          ? "Зв’язок із запитом перервався, але завантаження продовжується. Статус оновлюється автоматично."
          : ingestError instanceof Error
            ? ingestError.message
            : "Не вдалося завантажити дані",
      );
    } finally {
      setIngesting(false);
    }
  }

  const reportDate = data?.summary.reportDate ?? date;
  const normalizedVehicleQuery = vehicleQuery.trim().toLowerCase();
  const shouldFilterVehicles = normalizedVehicleQuery.length >= 2;
  const filteredTrips =
    data?.trips.filter((trip) =>
      trip.vehicle.display_name.toLowerCase().includes(normalizedVehicleQuery),
    ) ?? [];
  const visibleTrips = shouldFilterVehicles ? filteredTrips : (data?.trips ?? []);
  const tableHint = shouldFilterVehicles
    ? `Знайдено ${visibleTrips.length} з ${data?.trips.length ?? 0}`
    : `${data?.trips.length ?? 0} рядків`;
  const ingestionRunning = data?.ingestion.status === "running";
  const actionBusy = ingesting || ingestionRunning;
  const checkingDate = loading && !data;
  const actionDisabled = actionBusy || checkingDate;
  const actionLabel = actionBusy
    ? "Завантаження…"
    : checkingDate
      ? "Перевірка…"
      : data?.ingestion.hasData
        ? "Перезавантажити дані"
        : "Завантажити дані";
  const statusTone =
    data?.ingestion.status === "failed"
      ? "danger"
      : data?.ingestion.status === "partial"
        ? "warning"
        : data?.ingestion.status === "completed"
          ? "success"
          : undefined;
  const serverProgress = ingestionRunning ? data?.ingestion : null;
  const progressExpected =
    serverProgress?.expectedVehicles ?? data?.ingestion.expectedVehicles ?? 0;
  const progressProcessed = serverProgress?.processedVehicles ?? 0;
  const progressSuccessful = serverProgress?.successfulVehicles ?? 0;
  const progressFailed = serverProgress?.failedVehicles ?? 0;
  const progressRemaining = Math.max(
    0,
    progressExpected - progressProcessed,
  );
  const progressPercent =
    progressExpected > 0
      ? Math.min(100, Math.round((progressProcessed / progressExpected) * 100))
      : 0;
  const progressPhase = serverProgress?.phase ?? "starting";
  const currentVehicles = serverProgress?.currentVehicles ?? [];
  const progressStartedAt = serverProgress?.startedAt ?? null;

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Навігація">
        <div className="brand-mark" title="Fleet Analytics">
          <Database size={18} />
        </div>
        <nav className="side-nav">
          {navItems.map((item, index) => {
            const Icon = item.icon;
            return (
              <a
                key={item.label}
                className={`side-nav__item${index === 0 ? " side-nav__item--active" : ""}`}
                href={item.href}
                title={item.label}
              >
                <Icon size={18} />
              </a>
            );
          })}
        </nav>
      </aside>

      <main className="page">
        <header className="topbar">
          <div className="topbar__title">
            <div className="brand-mark">
              <Truck size={18} />
            </div>
            <div>
              <h1>Fleet Analytics</h1>
              <p className="mono">daily_trips / trip_segments</p>
            </div>
          </div>

          <div className="topbar__actions">
            <button
              className="button button--ghost theme-toggle"
              type="button"
              onClick={handleThemeToggle}
              aria-label={
                theme === "dark" ? "Перемкнути на світлу тему" : "Перемкнути на темну тему"
              }
            >
              {theme === "dark" ? <Moon size={16} /> : <Sun size={16} />}
              {theme === "dark" ? "Темна" : "Світла"}
            </button>
            <button className="button button--ghost" type="button" onClick={() => void handleSignOut()}>
              <LogOut size={16} />
              Вийти
            </button>
          </div>
        </header>

        <div className="content">
          <section id="overview" className="hero-strip">
            <div>
              <p className="eyebrow">Operations console</p>
              <h2>Подобовий звіт по машинах</h2>
              <p>
                Щільний перегляд флоту за дату{" "}
                <span className="mono">{reportDate}</span>: паливо, рух,
                стоянки, rolling 1000 км і контроль швидкості.
              </p>
            </div>
            <div className="chip-row" id="alerts">
              <Badge tone={data?.summary.vehiclesOverSpeedLimit ? "danger" : "success"}>
                <Gauge size={13} />
                {data?.summary.vehiclesOverSpeedLimit ?? 0} авто &gt;86
              </Badge>
              <Badge tone={data?.summary.withSegments ? "success" : "warning"}>
                <ListTree size={13} />
                {data?.summary.withSegments ?? 0} з рейсами
              </Badge>
            </div>
          </section>

          {error ? <div className="error-banner">{error}</div> : null}

          <section className="panel toolbar search-toolbar">
            <div className="filter-row">
              <label className="date-field">
                <CalendarDays size={15} />
                <input
                  className="input mono"
                  type="date"
                  value={date}
                  max={getKyivDate()}
                  disabled={actionBusy}
                  onChange={(event) => handleDateChange(event.target.value)}
                />
              </label>
              <button
                className="button button--primary ingest-button"
                type="button"
                onClick={() => void handleIngest()}
                disabled={actionDisabled}
              >
                <RefreshCw
                  className={actionBusy ? "spin" : undefined}
                  size={16}
                />
                {actionLabel}
              </button>
              {!checkingDate ? (
                <Badge tone={statusTone}>{ingestionLabel(data)}</Badge>
              ) : null}
            </div>
            <label className="search-field">
              <Search size={15} />
              <input
                className="input"
                type="search"
                placeholder="Пошук по номеру машини..."
                value={vehicleQuery}
                onChange={(event) => setVehicleQuery(event.target.value)}
              />
            </label>
            <p className="muted search-hint">
              {vehicleQuery.trim().length > 0 && vehicleQuery.trim().length < 2
                ? "Введіть мінімум 2 символи"
                : loading
                  ? "Завантаження даних..."
                  : tableHint}
            </p>
          </section>

          {actionBusy ? (
            <IngestionProgress
              date={date}
              phase={progressPhase}
              processed={progressProcessed}
              expected={progressExpected}
              successful={progressSuccessful}
              failed={progressFailed}
              remaining={progressRemaining}
              percent={progressPercent}
              currentVehicles={currentVehicles}
              elapsed={formatElapsed(progressStartedAt, progressClock)}
            />
          ) : null}

          <section id="vehicles" className="panel table-shell">
            <div className="table-scroll">
              <table className="data-table">
                <colgroup>
                  <col className="col-vehicle" />
                  <col className="col-route" />
                  <col className="col-number" />
                  <col className="col-number" />
                  <col className="col-number-wide" />
                  <col className="col-number-wide" />
                  <col className="col-number-wide" />
                  <col className="col-action" />
                </colgroup>
                <thead>
                  <tr>
                    <th>Авто</th>
                    <th>Маршрут</th>
                    <th className="data-table__number">Пробіг</th>
                    <th className="data-table__number">Витрачено</th>
                    <th className="data-table__number">Сер. розхід</th>
                    <th className="data-table__number">1000 км</th>
                    <th className="data-table__number">Час руху</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {!data || visibleTrips.length === 0 ? (
                    <tr>
                      <td colSpan={8}>
                        <div className="empty-state empty-state--action">
                          <p>
                            {loading
                              ? "Перевіряємо дані за вибрану дату…"
                              : shouldFilterVehicles
                                ? "Нічого не знайдено за цим номером"
                                : "За вибрану дату дані ще не завантажені."}
                          </p>
                          {!loading && !shouldFilterVehicles ? (
                            <button
                              className="button button--primary"
                              type="button"
                              onClick={() => void handleIngest()}
                              disabled={actionDisabled}
                            >
                              <RefreshCw
                                className={actionBusy ? "spin" : undefined}
                                size={16}
                              />
                              {actionLabel}
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ) : (
                    visibleTrips.map((trip) => (
                      <Fragment key={trip.id}>
                        <VehicleRow
                          trip={trip}
                          expanded={expandedId === trip.id}
                          onToggle={() =>
                            setExpandedId((current) =>
                              current === trip.id ? null : trip.id,
                            )
                          }
                        />
                        {expandedId === trip.id ? <VehicleDetails trip={trip} /> : null}
                      </Fragment>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

function IngestionProgress({
  date,
  phase,
  processed,
  expected,
  successful,
  failed,
  remaining,
  percent,
  currentVehicles,
  elapsed,
}: {
  date: string;
  phase: "starting" | "processing" | "finalizing";
  processed: number;
  expected: number;
  successful: number;
  failed: number;
  remaining: number;
  percent: number;
  currentVehicles: Array<{
    wialonUnitId: number;
    displayName: string;
  }>;
  elapsed: string;
}) {
  const phaseLabel =
    phase === "finalizing"
      ? "Завершуємо обробку"
      : phase === "processing"
        ? "Отримуємо звіти по машинах"
        : "Готуємо список машин";
  const currentLabel =
    currentVehicles.length > 0
      ? currentVehicles.map((vehicle) => vehicle.displayName).join(", ")
      : phase === "finalizing"
        ? "Усі машини оброблені"
        : phase === "starting"
          ? "Формуємо список машин"
          : "Очікуємо наступну пачку";

  return (
    <section
      className="panel ingestion-progress"
      aria-live="polite"
      aria-label="Прогрес завантаження даних"
    >
      <div className="ingestion-progress__header">
        <div>
          <p className="eyebrow">Завантаження активне</p>
          <h3>Оновлюємо дані за {formatDateLabel(date)}</h3>
          <p>{phaseLabel}. Таблиця оновлюється автоматично.</p>
        </div>
        <div className="ingestion-progress__total mono">
          <strong>{processed}</strong>
          <span>з {expected || "—"} машин</span>
        </div>
      </div>

      <div
        className="progress-track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={expected || 1}
        aria-valuenow={processed}
        aria-valuetext={`${processed} з ${expected} машин, ${percent}%`}
      >
        <span
          className="progress-track__fill"
          style={{ width: `${percent}%` }}
        />
      </div>

      <div className="ingestion-progress__meta">
        <div className="current-vehicles">
          <span className="current-vehicles__pulse" aria-hidden="true" />
          <div>
            <span className="muted">Зараз обробляються</span>
            <strong>{currentLabel}</strong>
          </div>
        </div>
        <strong className="mono">{percent}%</strong>
      </div>

      <div className="ingestion-progress__stats">
        <span>
          <CheckCircle2 size={15} />
          Успішно <strong>{successful}</strong>
        </span>
        <span className={failed > 0 ? "progress-stat--danger" : undefined}>
          <AlertTriangle size={15} />
          З помилкою <strong>{failed}</strong>
        </span>
        <span>
          <Truck size={15} />
          Залишилось <strong>{remaining}</strong>
        </span>
        <span>
          <Clock3 size={15} />
          Триває <strong>{elapsed}</strong>
        </span>
      </div>
    </section>
  );
}

function VehicleRow({
  trip,
  expanded,
  onToggle,
}: {
  trip: DailyTrip;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <tr className="vehicle-card-row">
      <td colSpan={8}>
        <div className="vehicle-card">
          <div className="vehicle-main-grid">
            <div className="vehicle-cell">
              <div className="vehicle-name">
                <Truck size={15} />
                {trip.vehicle.display_name}
              </div>
              <div className="vehicle-meta mono">unit {trip.vehicle.wialon_unit_id}</div>
            </div>
            <div>
              <div className="route-flags" title={trip.route_key ?? undefined}>
                {routeFlags(trip.route_key)}
              </div>
            </div>
            <div className="data-table__number mono">{formatNum(trip.mileage_km)} km</div>
            <div className="data-table__number mono">
              {formatNum(trip.fuel_consumed_l, " l")}
            </div>
            <div className="data-table__number mono">
              {formatNum(trip.average_fuel_consumption_l_per_100km, " l/100")}
            </div>
            <div className="data-table__number mono">
              {formatNum(trip.rolling_1000km_consumption_l_per_100km, " l/100")}
            </div>
            <div className="data-table__number mono">
              {formatDuration(trip.movement_duration_seconds)}
            </div>
            <div className="data-table__number">
              <button
                className="button icon-button"
                type="button"
                onClick={onToggle}
                aria-label={expanded ? "Сховати деталі" : "Показати деталі"}
              >
                {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </button>
            </div>
          </div>

          <div className="chip-row vehicle-statuses">
            {trip.speedLimitExceeded ? (
              <Badge tone="danger">
                <AlertTriangle size={13} />
                &gt;86
              </Badge>
            ) : (
              <Badge tone="success">ok</Badge>
            )}
            {isAnomaly(trip.anomaly_status) ? (
              <Badge tone="warning">{trip.anomaly_status}</Badge>
            ) : null}
            {trip.segments.length === 0 ? <Badge tone="warning">no trips</Badge> : null}
            <Badge>
              <Gauge size={13} />
              max {formatNum(trip.max_speed_kmh, " km/h")}
            </Badge>
            <Badge>
              <Clock3 size={13} />
              стоянки {trip.parking_count_from_trips} ·{" "}
              {formatDuration(trip.parking_duration_seconds)}
            </Badge>
            <Badge>
              <Fuel size={13} />
              ДУТ {formatNum(trip.starting_fuel_l)} → {formatNum(trip.ending_fuel_l)} l
            </Badge>
            {trip.route_key ? <Badge>{trip.route_key}</Badge> : null}
          </div>
        </div>
      </td>
    </tr>
  );
}

function VehicleDetails({ trip }: { trip: DailyTrip }) {
  return (
    <tr className="details-row" id="trips">
      <td colSpan={8}>
        <div className="details-panel">
          <div className="chip-row">
            <Badge>
              <Clock3 size={13} />
              рух {formatDuration(trip.movement_duration_seconds)}
            </Badge>
            <Badge>
              <Fuel size={13} />
              паливо {formatNum(trip.fuel_consumed_l, " l")}
            </Badge>
            <Badge tone={trip.speedLimitExceeded ? "danger" : "success"}>
              <Gauge size={13} />
              max {formatNum(trip.max_speed_kmh, " km/h")}
            </Badge>
          </div>

          <div className="details-grid">
            <section className="panel details-panel">
              <div className="section-title">
                <h4>Рейси за добу</h4>
                <Badge>{trip.segments.length} rows</Badge>
              </div>
              <div className="table-scroll">
                {trip.segments.length === 0 ? (
                  <p className="empty-state">Немає сегментів поїздок у БД</p>
                ) : (
                  <table className="mini-table">
                    <thead>
                      <tr>
                        <th>Початок</th>
                        <th>Кінець</th>
                        <th>Тривалість</th>
                        <th>Пробіг</th>
                        <th>Паливо</th>
                        <th>Vсер/макс</th>
                        <th>Маршрут</th>
                      </tr>
                    </thead>
                    <tbody>
                      {trip.segments.map((segment) => (
                        <tr key={segment.id}>
                          <td className="mono">{formatTime(segment.started_at)}</td>
                          <td className="mono">{formatTime(segment.ended_at)}</td>
                          <td className="mono">{formatDuration(segment.duration_seconds)}</td>
                          <td className="mono">{formatNum(segment.mileage_km)} km</td>
                          <td className="mono">{formatNum(segment.fuel_consumed_l, " l")}</td>
                          <td className="mono">
                            {formatNum(segment.average_speed_kmh)} /{" "}
                            {formatNum(segment.max_speed_kmh)}
                          </td>
                          <td>
                            <span className="muted">
                              {segment.start_address ?? "-"} → {segment.end_address ?? "-"}
                            </span>
                            {segment.is_local_maneuver ? (
                              <>
                                {" "}
                                <Badge>local</Badge>
                              </>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </section>

            <section className="panel details-panel">
              <div className="section-title">
                <h4>Паузи між рейсами</h4>
                <Badge tone="warning">обчислено</Badge>
              </div>
              {trip.derivedPauses.length === 0 ? (
                <p className="empty-state">Немає пауз між сегментами</p>
              ) : (
                <ul className="pause-list">
                  {trip.derivedPauses.map((pause, index) => (
                    <li className="pause-item" key={`${pause.startedAt}-${index}`}>
                      <div className="mono">
                        {formatTime(pause.startedAt)} → {formatTime(pause.endedAt)}
                      </div>
                      <div className="muted">{formatDuration(pause.durationSeconds)}</div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      </td>
    </tr>
  );
}

function Badge({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone?: "success" | "danger" | "warning";
}) {
  const toneClass = tone ? ` badge--${tone}` : "";
  return <span className={`badge${toneClass}`}>{children}</span>;
}
