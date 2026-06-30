"use client";

import {
  AlertTriangle,
  Clock3,
  Fuel,
  Gauge,
  LogOut,
  Moon,
  Route,
  Search,
  Sun,
  Truck,
} from "lucide-react";
import {
  Suspense,
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Badge } from "@/components/Badge";
import { RangeFleetTable } from "@/components/fleet/RangeFleetTable";
import { CoveragePanel } from "@/components/report/CoveragePanel";
import { ReportRangeFilters } from "@/components/report/ReportRangeFilters";
import { formatReportDaysLabel } from "@/analytics/fuel-consumption-status";
import { isImportActive } from "@/lib/report/coverage";
import { useRangeReport } from "@/hooks/useRangeReport";
import { isValidDateParam, resolveInitialRange } from "@/lib/report/dates";
import {
  formatDate,
  formatDuration,
  formatNum,
  readJsonResponse,
} from "@/lib/report/format";
import { createClient } from "@/lib/supabase/client";

type ThemeMode = "light" | "dark";

const THEME_STORAGE_KEY = "fleet-dashboard-theme";

function isThemeMode(value: string | null): value is ThemeMode {
  return value === "light" || value === "dark";
}

function SummaryMetricCard({
  icon,
  label,
  value,
  children,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  children?: ReactNode;
  tone?: "danger" | "warning";
}) {
  const hasMeta = children != null;

  return (
    <article
      className={`panel summary-metric${tone ? ` summary-metric--${tone}` : ""}${
        hasMeta ? "" : " summary-metric--no-meta"
      }`}
    >
      <div className="summary-metric__header">
        <span className="summary-metric__icon">{icon}</span>
        <span>{label}</span>
      </div>
      <strong className="summary-metric__value mono">{value}</strong>
      {hasMeta ? <div className="summary-metric__meta">{children}</div> : null}
    </article>
  );
}

function SummaryDetailStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "danger" | "success" | "warning";
}) {
  return (
    <span className={tone ? `summary-metric__meta-stat--${tone}` : undefined}>
      <small>{label}</small>
      <strong className="mono">{value}</strong>
    </span>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={<HomePageFallback />}>
      <HomePageContent />
    </Suspense>
  );
}

function HomePageFallback() {
  return (
    <div className="app-shell">
      <main className="page">
        <div className="content">
          <div className="empty-state">Завантаження звіту…</div>
        </div>
      </main>
    </div>
  );
}

function HomePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");
  const urlRangeReady =
    isValidDateParam(fromParam) && isValidDateParam(toParam);
  const initialRange = resolveInitialRange(fromParam, toParam);

  const syncRangeToUrl = useCallback(
    (from: string, to: string) => {
      const params = new URLSearchParams();
      params.set("from", from);
      params.set("to", to);
      router.replace(`/?${params.toString()}`);
    },
    [router],
  );

  const {
    draftFrom,
    draftTo,
    setDraftFrom,
    setDraftTo,
    from,
    to,
    data,
    loading,
    mutating,
    rangeRunStatus,
    error,
    stuck,
    lastIdleReason,
    applyRange,
    applyPreset,
    runRangeImport,
    runMutation,
  } = useRangeReport({
    initialFrom: initialRange.from,
    initialTo: initialRange.to,
    urlRangeReady,
    onRangeApplied: syncRangeToUrl,
  });

  const [vehicleQuery, setVehicleQuery] = useState("");
  const [theme, setTheme] = useState<ThemeMode>("dark");

  useEffect(() => {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    const preferred = window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
    const next = isThemeMode(stored) ? stored : preferred;
    setTheme(next);
    document.documentElement.dataset.theme = next;
  }, []);

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
  const reportVehicles = data?.vehicles ?? [];
  const totalMileageKm = data?.summary?.totalMileageKm ?? 0;
  const totalFuelL = data?.summary?.totalFuelL ?? 0;
  const totalRefillCount = reportVehicles.reduce(
    (sum, vehicle) => sum + vehicle.refillCount,
    0,
  );
  const totalRefilledL = reportVehicles.reduce(
    (sum, vehicle) => sum + vehicle.refilledL,
    0,
  );
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
            <button
              className="button button--ghost"
              type="button"
              onClick={() => void handleSignOut()}
            >
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
                <span className="mono">
                  {formatDate(from)} — {formatDate(to)}
                </span>
                . Статус дат, завантаження і таблиця оновлюються без зміни API.
              </p>
            </div>
            <ReportRangeFilters
              draftFrom={draftFrom}
              draftTo={draftTo}
              from={from}
              to={to}
              mutating={mutating}
              onDraftFromChange={setDraftFrom}
              onDraftToChange={setDraftTo}
              onApply={applyRange}
              onPreset={applyPreset}
            />
          </section>

          {error ? <div className="error-banner">{error}</div> : null}

          <CoveragePanel
            coverage={data?.coverage ?? []}
            from={from}
            to={to}
            loading={loading}
            mutating={mutating}
            ready={Boolean(data?.ready)}
            runStatus={rangeRunStatus}
            stuck={stuck}
            lastIdleReason={lastIdleReason}
            onImport={() => void runRangeImport("missing")}
            onForceReload={() => void runRangeImport("force")}
            onRetry={() => void runRangeImport("missing", true)}
            onRestart={() => void runRangeImport("force")}
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

          {data?.partialReady && isImportActive(data.coverage) ? (
            <div className="provisional-banner">
              <Clock3 size={16} />
              Готово {readyDates}/{data.coverage.length} дат. Решта довантажується у фоні —
              сторінка оновлюється автоматично.
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
                <article className="panel fleet-summary__count">
                  <div className="summary-metric__header">
                    <span className="summary-metric__icon">
                      <Truck size={18} />
                    </span>
                    <span>Флот</span>
                  </div>
                  <strong className="fleet-summary__count-value mono">
                    {data?.summary?.vehicleCount ?? 0} авто
                  </strong>
                  <span className="fleet-summary__period">
                    {formatReportDaysLabel(data?.summary?.dateCount ?? 0)}
                  </span>
                  <div className="chip-row">
                    <Badge tone="success">
                      <AlertTriangle size={13} />
                      {data?.summary?.fuelStatusCounts?.normal ?? 0} нормальний розхід
                    </Badge>
                    <Badge tone="avrg">
                      <AlertTriangle size={13} />
                      {data?.summary?.fuelStatusCounts?.avrg ?? 0} середній розхід
                    </Badge>
                    <Badge
                      tone={
                        (data?.summary?.fuelStatusCounts?.high ?? 0) > 0
                          ? "danger"
                          : "success"
                      }
                    >
                      <AlertTriangle size={13} />
                      {data?.summary?.fuelStatusCounts?.high ?? 0} високий розхід
                    </Badge>
                  </div>
                </article>
                <SummaryMetricCard
                  icon={<Route size={18} />}
                  label="Пройдена відстань"
                  value={formatNum(totalMileageKm, " km")}
                >
                  <SummaryDetailStat
                    label="Авто"
                    value={(data?.summary?.vehicleCount ?? 0).toString()}
                  />
                  <SummaryDetailStat
                    label="Днів"
                    value={(data?.summary?.dateCount ?? 0).toString()}
                  />
                </SummaryMetricCard>
                <SummaryMetricCard
                  icon={<Fuel size={18} />}
                  label="Витрачено палива"
                  value={formatNum(totalFuelL, " l")}
                >
                  <SummaryDetailStat
                    label="Заправок"
                    value={totalRefillCount.toString()}
                  />
                  <SummaryDetailStat label="Залито" value={formatNum(totalRefilledL, " l")} />
                </SummaryMetricCard>
                <SummaryMetricCard
                  icon={<Gauge size={18} />}
                  label="Середня швидкість флоту"
                  value={formatNum(averageFleetSpeedKmh, " km/h")}
                >
                  <SummaryDetailStat
                    label="Час руху"
                    value={formatDuration(data?.summary?.totalMovementSeconds ?? null)}
                  />
                </SummaryMetricCard>
                <SummaryMetricCard
                  icon={<Truck size={18} />}
                  label="Середня витрата пального"
                  value={formatNum(averageFuelConsumptionLPer100Km, " l/100km")}
                />
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
                  <RangeFleetTable vehicles={vehicles} from={from} to={to} />
                </div>
              </section>
            </>
          ) : null}
        </div>
      </main>
    </div>
  );
}
