"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CalendarDays,
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
};

type ThemeMode = "light" | "dark";

const THEME_STORAGE_KEY = "fleet-dashboard-theme";

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

async function readReportResponse(response: Response): Promise<ReportResponse> {
  const text = await response.text();
  let json: (ReportResponse & { error?: string }) | null = null;

  try {
    json = JSON.parse(text) as ReportResponse & { error?: string };
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

export default function HomePage() {
  const router = useRouter();
  const [date, setDate] = useState("2026-06-14");
  const [data, setData] = useState<ReportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [vehicleQuery, setVehicleQuery] = useState("");
  const [theme, setTheme] = useState<ThemeMode>("dark");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/reports/daily?date=${date}`);
      const json = await readReportResponse(response);
      setData(json);
    } catch (loadError) {
      setData(null);
      setError(
        loadError instanceof Error ? loadError.message : "Failed to load report",
      );
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    void load();
  }, [load]);

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
            <button
              className="button"
              type="button"
              onClick={() => void load()}
              disabled={loading}
            >
              <RefreshCw size={16} />
              {loading ? "Оновлення" : "Оновити"}
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
                  onChange={(event) => setDate(event.target.value)}
                />
              </label>
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
                        <div className="empty-state">
                          {loading
                            ? "Завантаження..."
                            : shouldFilterVehicles
                              ? "Нічого не знайдено за цим номером"
                              : "Немає даних за вибрану дату"}
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
