"use client";

import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  Database,
  Gauge,
  ListTree,
  LogOut,
  Moon,
  RefreshCw,
  Search,
  Sun,
  Truck,
} from "lucide-react";
import { Fragment, useCallback, useEffect, useState } from "react";
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

  useEffect(() => {
    if (!data || data.ready) {
      return;
    }
    const interval = window.setInterval(() => {
      void load(true);
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [data, load]);

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
    setRangeRunStatus("Запускаю імпорт по вибраному періоду…");

    let nextMode = mode;
    let nextRetryFailed = retryFailed;
    try {
      for (let step = 0; step < 100; step += 1) {
        setRangeRunStatus("Імпорт виконується. Один запит обробляє одну дату.");
        const response = await fetch("/api/reports/range/run", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            from,
            to,
            mode: nextMode,
            retryFailed: nextRetryFailed,
          }),
        });
        const result = await readJsonResponse<RunRangeResponse>(response);
        const report = await load(true);

        if (result.reportDate) {
          setRangeRunStatus(`Оброблено дату ${formatDate(result.reportDate)}.`);
        }
        if (report?.ready || result.status === "idle") {
          break;
        }
        if (result.status !== "completed" && result.status !== "skipped") {
          break;
        }

        nextMode = "missing";
        nextRetryFailed = false;
      }
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
  const todayCoverage = data?.coverage.find((day) => day.isToday);
  const selectedPresetDays = (() => {
    const days = inclusiveDateCount(from, to);
    return to === getKyivDate(-1) && [1, 7, 30, 90].includes(days) ? days : null;
  })();

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Навігація">
        <div className="brand-mark" title="Fleet Analytics">
          <Database size={18} />
        </div>
      </aside>

      <main className="page">
        <header className="topbar">
          <div className="topbar__title">
            <div className="brand-mark">
              <Truck size={18} />
            </div>
            <div>
              <h1>Fleet Analytics</h1>
              <p className="mono">range / vehicle / day / trip</p>
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
          <section className="hero-strip">
            <div>
              <p className="eyebrow">Fleet operations console</p>
              <h2>Звіт за період</h2>
              <p>
                Агреговані показники по машинах за{" "}
                <span className="mono">{formatDate(from)} — {formatDate(to)}</span>.
                Дані відображаються після завершення всіх дат.
              </p>
            </div>
            <div className="chip-row">
              <Badge tone={data?.ready ? "success" : "warning"}>
                {data?.ready ? <CheckCircle2 size={13} /> : <Clock3 size={13} />}
                {data?.ready ? "період готовий" : `${readyDates}/${data?.coverage.length ?? 0} дат`}
              </Badge>
              <Badge>
                <Truck size={13} />
                {data?.summary?.vehicleCount ?? 0} авто
              </Badge>
            </div>
          </section>

          {error ? <div className="error-banner">{error}</div> : null}

          <section className="panel range-toolbar">
            <div className="range-block">
              <span className="range-block__label">Швидкий вибір</span>
              <p className="range-block__hint">
                Натиснув пресет — період одразу обирається. Завантаження
                стартує окремою кнопкою нижче.
              </p>
              <div className="preset-row" aria-label="Швидкий вибір періоду">
                {([1, 7, 30, 90] as const).map((days) => (
                  <button
                    className={`button button--ghost${
                      selectedPresetDays === days ? " button--selected" : ""
                    }`}
                    type="button"
                    key={days}
                    onClick={() => applyPreset(days)}
                    disabled={mutating}
                  >
                    {days === 1 ? "Учора" : `${days} днів`}
                  </button>
                ))}
              </div>
            </div>
            <div className="range-block range-block--custom">
              <span className="range-block__label">Свій період</span>
              <p className="range-block__hint">
                Якщо міняєш дати вручну — натисни «Обрати період», потім
                «Запустити завантаження».
              </p>
              <div className="range-fields">
                <label className="field">
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
                <label className="field">
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
                  Обрати період
                </button>
              </div>
              <div className="range-actions">
                <button
                  className="button button--primary"
                  type="button"
                  disabled={mutating}
                  onClick={() => void runRangeImport("missing")}
                >
                  <RefreshCw className={mutating ? "spin" : undefined} size={16} />
                  Запустити завантаження
                </button>
                <button
                  className="button button--ghost"
                  type="button"
                  disabled={mutating}
                  onClick={() => void runRangeImport("force")}
                >
                  <RefreshCw size={16} />
                  Повністю перезавантажити
                </button>
                {todayCoverage ? (
                  <button
                    className="button button--ghost"
                    type="button"
                    disabled={mutating}
                    onClick={() =>
                      void runMutation(async () => {
                        const response = await fetch("/api/reports/range/today", {
                          method: "POST",
                        });
                        await readJsonResponse(response);
                      })
                    }
                  >
                    <RefreshCw size={16} />
                    Оновити сьогодні
                  </button>
                ) : null}
              </div>
            </div>
          </section>

          {!data?.ready ? (
            <CoveragePanel
              coverage={data?.coverage ?? []}
              loading={loading}
              mutating={mutating}
              runStatus={rangeRunStatus}
              onRetry={() =>
                void runRangeImport("missing", true)
              }
            />
          ) : (
            <>
              {todayCoverage?.state === "provisional" ? (
                <div className="provisional-banner">
                  <AlertTriangle size={16} />
                  Дані за сьогодні попередні й можуть змінитися до завершення доби.
                </div>
              ) : null}

              <section className="range-summary-grid">
                <SummaryMetric label="Пробіг" value={formatNum(data.summary?.totalMileageKm ?? 0, " km")} />
                <SummaryMetric label="Паливо" value={formatNum(data.summary?.totalFuelL ?? 0, " l")} />
                <SummaryMetric label="Час руху" value={formatDuration(data.summary?.totalMovementSeconds ?? 0)} />
                <SummaryMetric label="Перевищення" value={`${data.summary?.vehiclesOverSpeedLimit ?? 0} авто`} tone="danger" />
                <SummaryMetric label="Аномалії" value={`${data.summary?.anomalyVehicles ?? 0} авто`} tone="warning" />
              </section>

              <section className="panel vehicle-search-row" aria-label="Пошук автомобіля">
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
                  {vehicles.length} з {data.vehicles.length} авто
                </p>
              </section>

              <section className="panel table-shell">
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
                      {vehicles.map((vehicle) => (
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
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

function CoveragePanel({
  coverage,
  loading,
  mutating,
  runStatus,
  onRetry,
}: {
  coverage: CoverageDay[];
  loading: boolean;
  mutating: boolean;
  runStatus: string | null;
  onRetry: () => void;
}) {
  const ready = coverage.filter((day) => day.ready).length;
  const failed = coverage.filter((day) => day.state === "failed");
  const queued = coverage.filter((day) => day.state === "queued").length;
  const running = coverage.filter((day) => day.state === "running").length;
  const partial = coverage.filter((day) => day.state === "partial").length;
  const missing = coverage.filter((day) => day.state === "missing").length;
  const importActive = mutating || running + partial > 0;
  const percent = coverage.length > 0 ? Math.round((ready / coverage.length) * 100) : 0;
  const title = loading
    ? "Перевіряю, що вже є в БД"
    : failed.length > 0
      ? "Є failed-дати — потрібен retry"
      : importActive
        ? "Завантаження запущене кнопкою"
        : queued > 0
          ? "Дати в черзі — можна запускати"
          : missing > 0
            ? "Є дати без snapshot"
            : "Очікую готовність усіх дат";
  const description = loading
    ? "Зараз читаю coverage по вибраному періоду."
    : failed.length > 0
      ? "Натисни «Повторити», щоб знову запустити проблемні дати."
      : importActive
        ? (runStatus ?? "Нічого не натискай. Імпорт іде, сторінка оновлює статус.")
        : queued > 0
          ? "Натисни «Запустити завантаження», щоб обробити дати з черги."
          : missing > 0
            ? "Натисни «Запустити завантаження». Система поставить ці дати в чергу і одразу почне імпорт."
            : "Якщо таблиця ще не показана — дочекайся завершення поточного імпорту або повтори запуск.";

  return (
    <section className="panel coverage-panel" aria-live="polite">
      <div className="coverage-header">
        <div>
          <p className="eyebrow">Статус завантаження</p>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
        <div className="coverage-total mono">
          <strong>{ready}/{coverage.length || "—"}</strong>
          <span>{percent}% готово</span>
        </div>
      </div>
      <div className="progress-track">
        <span className="progress-track__fill" style={{ width: `${percent}%` }} />
      </div>
      {!loading && (queued > 0 || missing > 0) && !importActive && failed.length === 0 ? (
        <div className="coverage-state-card">
          <Clock3 size={18} />
          <div>
            <strong>
              {queued > 0
                ? `${queued} дат у черзі.`
                : `${missing} дат ще не поставлені в чергу.`}
            </strong>
            <span>
              Для старту натисни «Запустити завантаження». Це запустить імпорт
              напряму з кнопки.
            </span>
          </div>
        </div>
      ) : null}
      {!loading && importActive ? (
        <div className="coverage-state-card coverage-state-card--running">
          <RefreshCw className="spin" size={18} />
          <div>
            <strong>Імпорт виконується.</strong>
            <span>
              {runStatus ?? `В роботі: ${running + partial} дат. Готово: ${ready}/${coverage.length}.`}
            </span>
          </div>
        </div>
      ) : null}
      <div className="coverage-days">
        {coverage.map((day) => (
          <div className={`coverage-day coverage-day--${day.state}`} key={day.date}>
            <span className="mono">{formatDate(day.date)}</span>
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
            {day.expectedVehicles > 0 ? (
              <span className="muted mono">
                {day.successfulVehicles}/{day.expectedVehicles}
              </span>
            ) : null}
            {day.lastError ? <small title={day.lastError}>{day.lastError}</small> : null}
          </div>
        ))}
      </div>
      {failed.length > 0 ? (
        <div className="coverage-retry">
          <span>
            <AlertTriangle size={15} />
            Не завантажено дат: <strong>{failed.length}</strong>
          </span>
          <button className="button button--primary" type="button" disabled={mutating} onClick={onRetry}>
            <RefreshCw className={mutating ? "spin" : undefined} size={16} />
            Повторити
          </button>
        </div>
      ) : null}
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
