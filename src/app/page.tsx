"use client";

import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  Gauge,
  ListTree,
  LogOut,
  Moon,
  RefreshCw,
  Search,
  Sun,
  Truck,
} from "lucide-react";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type CoverageState =
  | "ready"
  | "provisional"
  | "missing"
  | "queued"
  | "running"
  | "partial"
  | "failed";

type CoverageDay = {
  date: string;
  state: CoverageState;
  ready: boolean;
  isToday: boolean;
  successfulVehicles: number;
  failedVehicles: number;
  expectedVehicles: number;
  queueAttempts: number;
  lastError: string | null;
  updatedAt: string | null;
};

type RangeDay = {
  id: string;
  reportDate: string;
  mileageKm: number;
  fuelConsumedL: number | null;
  averageFuelConsumptionLPer100Km: number | null;
  rolling1000KmConsumptionLPer100Km: number | null;
  movementDurationSeconds: number | null;
  parkingCount: number;
  parkingDurationSeconds: number | null;
  maxSpeedKmh: number | null;
  anomalyStatus: string;
  routeKey: string | null;
};

type RangeVehicle = {
  vehicle: {
    id: string;
    displayName: string;
    tractorNumber: string;
    wialonUnitId: number;
  };
  mileageKm: number;
  fuelConsumedL: number;
  consumptionLPer100Km: number | null;
  rolling1000KmConsumptionLPer100Km: number | null;
  movementDurationSeconds: number;
  parkingCount: number;
  parkingDurationSeconds: number;
  maxSpeedKmh: number | null;
  anomalyStatus: string;
  anomalyDays: number;
  days: RangeDay[];
};

type RangeResponse = {
  range: { from: string; to: string; today: string };
  ready: boolean;
  partialReady: boolean;
  coverage: CoverageDay[];
  summary: {
    vehicleCount: number;
    dateCount: number;
    totalMileageKm: number;
    totalFuelL: number;
    totalMovementSeconds: number;
    vehiclesOverSpeedLimit: number;
    anomalyVehicles: number;
  } | null;
  vehicles: RangeVehicle[];
};

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

type DetailsResponse = {
  segments: TripSegment[];
  derivedPauses: Array<{
    kind: "inferred";
    startedAt: string;
    endedAt: string;
    durationSeconds: number;
  }>;
};

type RunRangeResponse = {
  ok: boolean;
  status: "completed" | "partial" | "failed" | "skipped" | "idle";
  reportDate?: string;
  reason?: string | null;
};

type EnsureRangeResponse = {
  ok: boolean;
  queued: string[];
  skipped: string[];
};

type ThemeMode = "light" | "dark";

const BUSINESS_TIMEZONE = "Europe/Kyiv";
const THEME_STORAGE_KEY = "fleet-dashboard-theme";
const POLL_INTERVAL_MS = 5_000;

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

function dateDaysAgo(days: number, end = getKyivDate(-1)): string {
  const date = new Date(`${end}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function inclusiveDateCount(from: string, to: string): number {
  const start = new Date(`${from}T00:00:00Z`).getTime();
  const end = new Date(`${to}T00:00:00Z`).getTime();
  return Math.max(0, Math.round((end - start) / 86_400_000) + 1);
}

function formatNum(value: number | null, suffix = ""): string {
  if (value == null || Number.isNaN(value)) {
    return "—";
  }
  return `${value.toLocaleString("uk-UA", { maximumFractionDigits: 2 })}${suffix}`;
}

function formatDuration(seconds: number | null): string {
  if (seconds == null || seconds <= 0) {
    return "—";
  }
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours} год ${minutes} хв`;
}

function formatDate(date: string): string {
  const [year, month, day] = date.split("-");
  return `${day}.${month}.${year}`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("uk-UA", {
    timeZone: BUSINESS_TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isThemeMode(value: string | null): value is ThemeMode {
  return value === "light" || value === "dark";
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  let json: (T & { error?: string }) | null = null;
  try {
    json = JSON.parse(text) as T & { error?: string };
  } catch {
    throw new Error(`API повернув невалідну відповідь (${response.status})`);
  }
  if (!response.ok) {
    throw new Error(json.error ?? `Запит не виконано (${response.status})`);
  }
  return json;
}

function coverageLabel(state: CoverageState): string {
  const labels: Record<CoverageState, string> = {
    ready: "готово",
    provisional: "попередні",
    missing: "немає даних",
    queued: "у черзі",
    running: "завантаження",
    partial: "частково",
    failed: "помилка",
  };
  return labels[state];
}

export default function HomePage() {
  const router = useRouter();
  const yesterday = getKyivDate(-1);
  const [draftFrom, setDraftFrom] = useState(yesterday);
  const [draftTo, setDraftTo] = useState(yesterday);
  const [from, setFrom] = useState(yesterday);
  const [to, setTo] = useState(yesterday);
  const [data, setData] = useState<RangeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [mutating, setMutating] = useState(false);
  const [rangeRunStatus, setRangeRunStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedVehicleId, setExpandedVehicleId] = useState<string | null>(null);
  const [vehicleQuery, setVehicleQuery] = useState("");
  const [theme, setTheme] = useState<ThemeMode>("dark");
  const mutatingRef = useRef(false);
  const kickingRef = useRef(false);

  mutatingRef.current = mutating;

  const load = useCallback(
    async (silent = false): Promise<RangeResponse | null> => {
      if (!silent) {
        setLoading(true);
        setError(null);
      }
      try {
        const response = await fetch(
          `/api/reports/range?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
        );
        const json = await readJsonResponse<RangeResponse>(response);
        setData(json);
        return json;
      } catch (loadError) {
        if (!silent) {
          setData(null);
        }
        setError(
          loadError instanceof Error ? loadError.message : "Не вдалося завантажити звіт",
        );
        return null;
      } finally {
        if (!silent) {
          setLoading(false);
        }
      }
    },
    [from, to],
  );

  useEffect(() => {
    void load();
  }, [from, load, to]);

  const kickNextQueuedDate = useCallback(async (): Promise<RunRangeResponse> => {
    const response = await fetch("/api/reports/range/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ from, to }),
    });
    return readJsonResponse<RunRangeResponse>(response);
  }, [from, to]);

  const shouldPollCoverage = Boolean(data && !data.ready);

  useEffect(() => {
    if (!shouldPollCoverage) {
      return;
    }

    let cancelled = false;

    const tick = async (): Promise<void> => {
      if (cancelled || mutatingRef.current) {
        return;
      }

      const json = await load(true);
      if (cancelled || !json || json.ready) {
        return;
      }

      const hasQueued = json.coverage.some((day) => day.state === "queued");
      const hasRunning = json.coverage.some(
        (day) => day.state === "running" || day.state === "partial",
      );

      if (!hasQueued || hasRunning || kickingRef.current) {
        return;
      }

      kickingRef.current = true;
      try {
        setRangeRunStatus("Обробляю наступну дату з черги…");
        const result = await kickNextQueuedDate();
        if (result.reportDate) {
          setRangeRunStatus(`Оброблено ${formatDate(result.reportDate)}…`);
        }
        await load(true);
      } catch (kickError) {
        setError(
          kickError instanceof Error
            ? kickError.message
            : "Не вдалося обробити дату з черги",
        );
      } finally {
        kickingRef.current = false;
      }
    };

    void tick();
    const interval = window.setInterval(() => {
      void tick();
    }, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [shouldPollCoverage, kickNextQueuedDate, load]);

  useEffect(() => {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    const preferred = window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
    const next = isThemeMode(stored) ? stored : preferred;
    setTheme(next);
    document.documentElement.dataset.theme = next;
  }, []);

  function applyRange(): void {
    setError(null);
    setData(null);
    setRangeRunStatus(null);
    setExpandedVehicleId(null);
    setFrom(draftFrom);
    setTo(draftTo);
  }

  function applyPreset(days: 1 | 7 | 30 | 90): void {
    const end = getKyivDate(-1);
    const start = dateDaysAgo(days - 1, end);
    setDraftFrom(start);
    setDraftTo(end);
    setFrom(start);
    setTo(end);
    setData(null);
    setRangeRunStatus(null);
    setExpandedVehicleId(null);
  }

  async function runRangeImport(
    mode: "missing" | "force",
    retryFailed = false,
  ): Promise<void> {
    setMutating(true);
    setError(null);
    setRangeRunStatus("Ставлю пропущені дати в чергу…");

    try {
      const ensureResponse = await fetch("/api/reports/range/ensure", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          from,
          to,
          mode,
          retryFailed,
        }),
      });
      const ensureResult = await readJsonResponse<EnsureRangeResponse>(
        ensureResponse,
      );
      setRangeRunStatus(
        ensureResult.queued.length > 0
          ? `У черзі ${ensureResult.queued.length} дат. Запускаю першу…`
          : "Черга вже заповнена. Перевіряю наявні завдання…",
      );

      const runResponse = await fetch("/api/reports/range/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ from, to }),
      });
      const runResult = await readJsonResponse<RunRangeResponse>(runResponse);
      if (runResult.reportDate) {
        setRangeRunStatus(`Стартовано дату ${formatDate(runResult.reportDate)}.`);
      }
      await load(true);
    } catch (runError) {
      setError(
        runError instanceof Error
          ? runError.message
          : "Не вдалося запустити імпорт",
      );
    } finally {
      setMutating(false);
      setRangeRunStatus(null);
      await load(true);
    }
  }

  async function runMutation(action: () => Promise<void>): Promise<void> {
    setMutating(true);
    setError(null);
    try {
      await action();
      await load(true);
    } catch (mutationError) {
      setError(
        mutationError instanceof Error
          ? mutationError.message
          : "Не вдалося виконати дію",
      );
    } finally {
      setMutating(false);
    }
  }

  async function handleSignOut(): Promise<void> {
    await createClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  function toggleTheme(): void {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    window.localStorage.setItem(THEME_STORAGE_KEY, next);
  }

  const normalizedQuery = vehicleQuery.trim().toLowerCase();
  const vehicles =
    data?.vehicles.filter((vehicle) =>
      vehicle.vehicle.displayName.toLowerCase().includes(normalizedQuery),
    ) ?? [];
  const readyDates = data?.coverage.filter((day) => day.ready).length ?? 0;
  const showReportData = Boolean(data?.ready || data?.partialReady);
  const todayCoverage = data?.coverage.find((day) => day.isToday);
  const selectedPresetDays = (() => {
    const days = inclusiveDateCount(from, to);
    return to === getKyivDate(-1) && [1, 7, 30, 90].includes(days) ? days : null;
  })();
  const totalMileageKm = data?.summary?.totalMileageKm ?? 0;
  const totalFuelL = data?.summary?.totalFuelL ?? 0;
  const averageFleetSpeedKmh =
    data?.summary && data.summary.totalMovementSeconds > 0
      ? totalMileageKm / (data.summary.totalMovementSeconds / 3600)
      : null;
  const averageFuelConsumptionLPer100Km =
    totalMileageKm > 0 ? (totalFuelL / totalMileageKm) * 100 : null;

  return (
    <div className="app-shell">
      <main className="page">
        <header className="topbar">
          <div className="topbar__title">
            <div className="brand-mark">
              <Truck size={18} />
            </div>
            <div>
              <h1>Brokinvest Group</h1>
              <p className="mono">moniterra.services</p>
            </div>
          </div>
          <div className="topbar__actions">
            <button className="button button--ghost" type="button" onClick={toggleTheme}>
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
          <section className="report-hero">
            <div className="report-hero__copy">
              <a className="service-link" href="https://moniterra.services" rel="noreferrer">
                moniterra.services
              </a>
              <h2>Зведені звіти по машинах</h2>
              <p>
                Агреговані показники по машинах за{" "}
                <span className="mono">{formatDate(from)} — {formatDate(to)}</span>.
                Статус дат, завантаження і таблиця оновлюються без зміни API.
              </p>
            </div>
            <div className="report-filters" aria-label="Фільтри періоду">
              <div className="preset-row" aria-label="Швидкий вибір періоду">
                {([1, 7, 30] as const).map((days) => (
                  <button
                    className={`button button--ghost${
                      selectedPresetDays === days ? " button--selected" : ""
                    }`}
                    type="button"
                    key={days}
                    onClick={() => applyPreset(days)}
                    disabled={mutating}
                  >
                    {days === 1 ? "Учора" : days === 7 ? "Тиждень" : "Місяць"}
                  </button>
                ))}
              </div>
              <div className="range-fields report-range-fields">
                <label className="field field--compact">
                  <span>Від</span>
                  <input
                    className="input mono"
                    type="date"
                    value={draftFrom}
                    max={draftTo}
                    onChange={(event) => setDraftFrom(event.target.value)}
                  />
                </label>
                <span className="range-separator">→</span>
                <label className="field field--compact">
                  <span>До</span>
                  <input
                    className="input mono"
                    type="date"
                    value={draftTo}
                    min={draftFrom}
                    max={getKyivDate()}
                    onChange={(event) => setDraftTo(event.target.value)}
                  />
                </label>
                <button
                  className="button button--primary"
                  type="button"
                  onClick={applyRange}
                  disabled={mutating || !draftFrom || !draftTo}
                >
                  <CalendarDays size={16} />
                  Застосувати
                </button>
              </div>
            </div>
          </section>

          {error ? <div className="error-banner">{error}</div> : null}

          <CoveragePanel
            coverage={data?.coverage ?? []}
            loading={loading}
            mutating={mutating}
            ready={Boolean(data?.ready)}
            runStatus={rangeRunStatus}
            onImport={() => void runRangeImport("missing")}
            onForceReload={() => void runRangeImport("force")}
            onRetry={() => void runRangeImport("missing", true)}
            onRefreshToday={
              todayCoverage
                ? () =>
                    void runMutation(async () => {
                      const response = await fetch("/api/reports/range/today", {
                        method: "POST",
                      });
                      await readJsonResponse(response);
                    })
                : undefined
            }
          />

          {data?.partialReady ? (
            <div className="provisional-banner">
              <Clock3 size={16} />
              Готово {readyDates}/{data.coverage.length} дат. Решта довантажується
              у фоні — сторінка оновлюється автоматично.
            </div>
          ) : null}

          {showReportData ? (
            <>
              {todayCoverage?.state === "provisional" ? (
                <div className="provisional-banner">
                  <AlertTriangle size={16} />
                  Дані за сьогодні попередні й можуть змінитися до завершення доби.
                </div>
              ) : null}

              <section className="fleet-summary" aria-label="Зведені показники">
                <div className="fleet-summary__count">
                  <strong>{data?.summary?.vehicleCount ?? 0} авто</strong>
                  <span>{data?.summary?.dateCount ?? 0} дат у звіті</span>
                  <div className="chip-row">
                    <Badge
                      tone={
                        (data?.summary?.vehiclesOverSpeedLimit ?? 0) > 0
                          ? "danger"
                          : "success"
                      }
                    >
                      <Gauge size={13} />
                      {data?.summary?.vehiclesOverSpeedLimit ?? 0} перевищень
                    </Badge>
                    <Badge
                      tone={
                        (data?.summary?.anomalyVehicles ?? 0) > 0
                          ? "warning"
                          : "success"
                      }
                    >
                      <AlertTriangle size={13} />
                      {data?.summary?.anomalyVehicles ?? 0} аномалій
                    </Badge>
                  </div>
                </div>
                <SummaryMetric label="Пройдена відстань" value={formatNum(totalMileageKm, " km")} />
                <SummaryMetric label="Витрачено палива" value={formatNum(totalFuelL, " l")} />
                <SummaryMetric label="Середня швидкість флоту" value={formatNum(averageFleetSpeedKmh, " km/h")} />
                <SummaryMetric label="Середня витрата пального" value={formatNum(averageFuelConsumptionLPer100Km, " l/100km")} />
              </section>

              <section className="report-section" aria-label="Пошук автомобіля">
                <div className="section-heading">
                  <h3>Пошук по машинах</h3>
                  <p className="muted">
                    {vehicles.length} з {data?.vehicles.length ?? 0} авто
                  </p>
                </div>
                <div className="panel vehicle-search-row">
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
                </div>
              </section>

              <section className="report-section" aria-label="Таблиця машин">
                <div className="section-heading">
                  <h3>Таблиця</h3>
                  <Badge>
                    <Truck size={13} />
                    {vehicles.length} авто
                  </Badge>
                </div>
                <div className="panel table-shell">
                  <div className="table-scroll">
                    <table className="data-table range-table">
                      <thead>
                        <tr>
                          <th>Авто</th>
                          <th className="data-table__number">Днів</th>
                          <th className="data-table__number">Пробіг</th>
                          <th className="data-table__number">Паливо</th>
                          <th className="data-table__number">Розхід</th>
                          <th className="data-table__number">1000 км</th>
                          <th className="data-table__number">Макс.</th>
                          <th className="data-table__number">Рух</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {vehicles.length > 0 ? (
                          vehicles.map((vehicle) => (
                            <Fragment key={vehicle.vehicle.id}>
                              <RangeVehicleRow
                                vehicle={vehicle}
                                expanded={expandedVehicleId === vehicle.vehicle.id}
                                onToggle={() =>
                                  setExpandedVehicleId((current) =>
                                    current === vehicle.vehicle.id
                                      ? null
                                      : vehicle.vehicle.id,
                                  )
                                }
                              />
                              {expandedVehicleId === vehicle.vehicle.id ? (
                                <RangeVehicleDetails vehicle={vehicle} />
                              ) : null}
                            </Fragment>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={9}>
                              <div className="empty-state empty-state--table">
                                За цим пошуком машин не знайдено.
                              </div>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>
            </>
          ) : null}
        </div>
      </main>
    </div>
  );
}

function CoveragePanel({
  coverage,
  loading,
  mutating,
  ready: rangeReady,
  runStatus,
  onImport,
  onForceReload,
  onRetry,
  onRefreshToday,
}: {
  coverage: CoverageDay[];
  loading: boolean;
  mutating: boolean;
  ready: boolean;
  runStatus: string | null;
  onImport: () => void;
  onForceReload: () => void;
  onRetry: () => void;
  onRefreshToday?: () => void;
}) {
  const readyCount = coverage.filter((day) => day.ready).length;
  const failed = coverage.filter((day) => day.state === "failed");
  const queued = coverage.filter((day) => day.state === "queued").length;
  const running = coverage.filter((day) => day.state === "running").length;
  const partial = coverage.filter((day) => day.state === "partial").length;
  const missing = coverage.filter((day) => day.state === "missing").length;
  const activeWork = mutating || running + partial > 0;
  const importActive = activeWork || queued > 0;
  const percent = coverage.length > 0 ? Math.round((readyCount / coverage.length) * 100) : 0;
  const allDataAvailable =
    coverage.length > 0 &&
    readyCount === coverage.length &&
    failed.length === 0 &&
    queued === 0 &&
    running === 0 &&
    partial === 0 &&
    missing === 0;
  const coverageSignature = coverage
    .map((day) => `${day.date}:${day.state}:${day.ready}`)
    .join("|");
  const [statusCollapsed, setStatusCollapsed] = useState(false);
  const title = loading
    ? "Перевіряю статус даних"
    : failed.length > 0
      ? "Є помилки завантаження"
      : activeWork
        ? "Завантаження в процесі"
        : queued > 0
          ? "Завантаження дат з черги"
          : missing > 0
            ? "Потрібно завантажити дані"
            : (rangeReady || readyCount === coverage.length) && coverage.length > 0
              ? "Дані завантажені"
              : "Очікую готовність даних";
  const description = loading
    ? "Зараз читаю coverage по вибраному періоду."
    : failed.length > 0
      ? "Натисни «Повторити», щоб знову запустити проблемні дати."
      : activeWork
        ? (runStatus ?? "Імпорт іде, сторінка оновлює статус автоматично.")
        : queued > 0
          ? "Наступні дати обробляються автоматично. Сторінку можна не закривати."
          : missing > 0
            ? "Натисни «Завантажити дані для звіту» — дати потраплять у чергу і перша одразу стартує."
            : coverage.length > 0
              ? "Усі доступні дати для вибраного періоду готові."
              : "Після вибору періоду тут з'явиться статус завантаження.";

  useEffect(() => {
    setStatusCollapsed(allDataAvailable);
  }, [allDataAvailable, coverageSignature]);

  return (
    <section
      className={`panel coverage-panel status-panel${
        statusCollapsed ? " status-panel--collapsed" : ""
      }`}
      aria-live="polite"
    >
      <div className="coverage-header">
        <div>
          <p className="eyebrow">Статус даних</p>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
        <div className="status-panel__header-actions">
          <div className="coverage-total mono">
            <strong>{readyCount}/{coverage.length || "—"}</strong>
            <span>{percent}% готово</span>
          </div>
          <button
            className="button button--ghost icon-button status-panel__toggle"
            type="button"
            aria-controls="coverage-status-panel-details"
            aria-expanded={!statusCollapsed}
            aria-label={statusCollapsed ? "Розгорнути статус даних" : "Згорнути статус даних"}
            title={statusCollapsed ? "Розгорнути статус даних" : "Згорнути статус даних"}
            onClick={() => setStatusCollapsed((current) => !current)}
          >
            {statusCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>
      <div
        className="status-panel__details"
        id="coverage-status-panel-details"
        hidden={statusCollapsed}
      >
        <div className="progress-track">
          <span className="progress-track__fill" style={{ width: `${percent}%` }} />
        </div>
        <div className="status-panel__body">
          {coverage.length > 0 ? (
            <div className="coverage-days">
              {coverage.map((day) => {
                const showVehicleProgress =
                  day.expectedVehicles > 0 &&
                  (!day.ready ||
                    day.successfulVehicles < day.expectedVehicles ||
                    day.state === "failed" ||
                    day.state === "partial");

                return (
                  <div className={`coverage-day coverage-day--${day.state}`} key={day.date}>
                    <div className="coverage-day__main">
                      <span className="coverage-day__date mono">{formatDate(day.date)}</span>
                      <Badge
                        tone={
                          day.ready
                            ? "success"
                            : day.state === "failed"
                              ? "danger"
                              : "warning"
                        }
                      >
                        {coverageLabel(day.state)}
                      </Badge>
                    </div>
                    {showVehicleProgress ? (
                      <span className="coverage-day__meta mono">
                        {day.successfulVehicles} з {day.expectedVehicles} авто
                      </span>
                    ) : null}
                    {day.lastError ? <small title={day.lastError}>{day.lastError}</small> : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="empty-state empty-state--compact">
              {loading ? "Завантажую статус дат..." : "Немає статусів для вибраного періоду."}
            </div>
          )}
        </div>
        <div className="status-actions">
          {failed.length > 0 ? (
            <>
              <span className="status-actions__note">
                <AlertTriangle size={15} />
                Не завантажено дат: <strong>{failed.length}</strong>
              </span>
              <button className="button button--primary" type="button" disabled={mutating} onClick={onRetry}>
                <RefreshCw className={mutating ? "spin" : undefined} size={16} />
                Повторити
              </button>
            </>
          ) : (
            <button className="button button--primary" type="button" disabled={loading || mutating} onClick={onImport}>
              {importActive ? <RefreshCw className="spin" size={16} /> : <CheckCircle2 size={16} />}
              {missing > 0 ? "Завантажити дані для звіту" : "Довантажити пропущені"}
            </button>
          )}
          <button className="button button--ghost" type="button" disabled={loading || mutating} onClick={onForceReload}>
            <RefreshCw size={16} />
            Повністю перезавантажити
          </button>
          {onRefreshToday ? (
            <button className="button button--ghost" type="button" disabled={loading || mutating} onClick={onRefreshToday}>
              <RefreshCw size={16} />
              Оновити сьогодні
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function SummaryMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "danger" | "warning";
}) {
  return (
    <div className={`panel summary-metric${tone ? ` summary-metric--${tone}` : ""}`}>
      <span>{label}</span>
      <strong className="mono">{value}</strong>
    </div>
  );
}

function RangeVehicleRow({
  vehicle,
  expanded,
  onToggle,
}: {
  vehicle: RangeVehicle;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <tr className="vehicle-card-row">
      <td colSpan={9}>
        <div className="vehicle-card">
          <div className="range-vehicle-grid">
            <div className="vehicle-cell">
              <div className="vehicle-name">
                <Truck size={15} />
                {vehicle.vehicle.displayName}
              </div>
              <div className="vehicle-meta mono">
                unit {vehicle.vehicle.wialonUnitId}
              </div>
            </div>
            <div className="data-table__number mono">{vehicle.days.length}</div>
            <div className="data-table__number mono">{formatNum(vehicle.mileageKm, " km")}</div>
            <div className="data-table__number mono">{formatNum(vehicle.fuelConsumedL, " l")}</div>
            <div className="data-table__number mono">{formatNum(vehicle.consumptionLPer100Km, " l/100")}</div>
            <div className="data-table__number mono">{formatNum(vehicle.rolling1000KmConsumptionLPer100Km, " l/100")}</div>
            <div className="data-table__number mono">{formatNum(vehicle.maxSpeedKmh, " km/h")}</div>
            <div className="data-table__number mono">{formatDuration(vehicle.movementDurationSeconds)}</div>
            <div className="data-table__number">
              <button className="button icon-button" type="button" onClick={onToggle}>
                {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </button>
            </div>
          </div>
          <div className="chip-row vehicle-statuses">
            <Badge tone={(vehicle.maxSpeedKmh ?? 0) > 86 ? "danger" : "success"}>
              <Gauge size={13} />
              {(vehicle.maxSpeedKmh ?? 0) > 86 ? "перевищення" : "швидкість ok"}
            </Badge>
            {vehicle.anomalyDays > 0 ? (
              <Badge tone="warning">
                <AlertTriangle size={13} />
                {vehicle.anomalyDays} аномальних днів
              </Badge>
            ) : null}
            <Badge>
              <Clock3 size={13} />
              стоянки {vehicle.parkingCount} · {formatDuration(vehicle.parkingDurationSeconds)}
            </Badge>
          </div>
        </div>
      </td>
    </tr>
  );
}

function RangeVehicleDetails({ vehicle }: { vehicle: RangeVehicle }) {
  const [expandedDayId, setExpandedDayId] = useState<string | null>(null);
  return (
    <tr className="details-row">
      <td colSpan={9}>
        <div className="details-panel">
          <div className="section-title">
            <h4>Дні в періоді</h4>
            <Badge>{vehicle.days.length} днів</Badge>
          </div>
          <div className="table-scroll">
            <table className="mini-table daily-breakdown-table">
              <thead>
                <tr>
                  <th>Дата</th>
                  <th>Пробіг</th>
                  <th>Паливо</th>
                  <th>Розхід</th>
                  <th>1000 км</th>
                  <th>Макс.</th>
                  <th>Рух</th>
                  <th>Статус</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {vehicle.days.map((day) => (
                  <Fragment key={day.id}>
                    <tr>
                      <td className="mono">{formatDate(day.reportDate)}</td>
                      <td className="mono">{formatNum(day.mileageKm, " km")}</td>
                      <td className="mono">{formatNum(day.fuelConsumedL, " l")}</td>
                      <td className="mono">{formatNum(day.averageFuelConsumptionLPer100Km, " l/100")}</td>
                      <td className="mono">{formatNum(day.rolling1000KmConsumptionLPer100Km, " l/100")}</td>
                      <td className="mono">{formatNum(day.maxSpeedKmh, " km/h")}</td>
                      <td className="mono">{formatDuration(day.movementDurationSeconds)}</td>
                      <td>
                        <Badge
                          tone={
                            day.anomalyStatus === "critical"
                              ? "danger"
                              : day.anomalyStatus === "warning"
                                ? "warning"
                                : "success"
                          }
                        >
                          {day.anomalyStatus}
                        </Badge>
                      </td>
                      <td>
                        <button
                          className="button icon-button"
                          type="button"
                          onClick={() =>
                            setExpandedDayId((current) =>
                              current === day.id ? null : day.id,
                            )
                          }
                          aria-label="Показати рейси"
                        >
                          {expandedDayId === day.id ? (
                            <ChevronDown size={15} />
                          ) : (
                            <ListTree size={15} />
                          )}
                        </button>
                      </td>
                    </tr>
                    {expandedDayId === day.id ? (
                      <tr className="day-details-row">
                        <td colSpan={9}>
                          <DayTripDetails dailyTripId={day.id} />
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </td>
    </tr>
  );
}

function DayTripDetails({ dailyTripId }: { dailyTripId: string }) {
  const [data, setData] = useState<DetailsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch(
          `/api/reports/range/details?dailyTripId=${encodeURIComponent(dailyTripId)}`,
        );
        setData(await readJsonResponse<DetailsResponse>(response));
      } catch (loadError) {
        setError(
          loadError instanceof Error ? loadError.message : "Не вдалося завантажити рейси",
        );
      }
    })();
  }, [dailyTripId]);

  if (error) {
    return <div className="error-banner">{error}</div>;
  }
  if (!data) {
    return (
      <div className="inline-loading">
        <RefreshCw className="spin" size={15} />
        Завантажуємо рейси…
      </div>
    );
  }
  if (data.segments.length === 0) {
    return <p className="empty-state">За цю дату немає сегментів поїздок.</p>;
  }

  return (
    <div className="day-details">
      <table className="trip-segments-table">
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
          {data.segments.map((segment) => (
            <tr key={segment.id}>
              <td className="mono">{formatTime(segment.started_at)}</td>
              <td className="mono">{formatTime(segment.ended_at)}</td>
              <td className="mono">{formatDuration(segment.duration_seconds)}</td>
              <td className="mono">{formatNum(segment.mileage_km, " km")}</td>
              <td className="mono">{formatNum(segment.fuel_consumed_l, " l")}</td>
              <td className="mono">
                {formatNum(segment.average_speed_kmh)} / {formatNum(segment.max_speed_kmh)}
              </td>
              <td>
                {segment.start_address ?? "—"} → {segment.end_address ?? "—"}
                {segment.is_local_maneuver ? <Badge>local</Badge> : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="pause-summary">
        <Clock3 size={14} />
        Обчислених пауз між рейсами: <strong>{data.derivedPauses.length}</strong>
      </div>
    </div>
  );
}

function Badge({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone?: "success" | "danger" | "warning";
}) {
  return (
    <span className={`badge${tone ? ` badge--${tone}` : ""}`}>{children}</span>
  );
}
