"use client";

import Link from "next/link";
import {
  Suspense,
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ChevronRight,
  Clock3,
  Fuel,
  Gauge,
  LogOut,
  MapPin,
  Moon,
  Route,
  Sun,
  Truck,
} from "lucide-react";
import { Badge } from "@/components/Badge";
import { CoveragePanel } from "@/components/report/CoveragePanel";
import { ReportRangeFilters } from "@/components/report/ReportRangeFilters";
import { VehicleSegmentsTable } from "@/components/vehicle/VehicleSegmentsTable";
import { useVehicleReport } from "@/hooks/useVehicleReport";
import { resolveInitialRange } from "@/lib/report/dates";
import {
  formatDate,
  formatDuration,
  formatNum,
  formatTime,
  readJsonResponse,
} from "@/lib/report/format";
import type { VehicleDetailsResponse } from "@/lib/report/types";
import { createClient } from "@/lib/supabase/client";

type ThemeMode = "light" | "dark";

const THEME_STORAGE_KEY = "fleet-dashboard-theme";

function isThemeMode(value: string | null): value is ThemeMode {
  return value === "light" || value === "dark";
}

function VehicleMetricCard({
  icon,
  label,
  value,
  children,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  children: ReactNode;
}) {
  return (
    <article className="panel vehicle-metric">
      <div className="vehicle-metric__header">
        <span className="vehicle-metric__icon">{icon}</span>
        <span>{label}</span>
      </div>
      <strong className="vehicle-metric__value mono">{value}</strong>
      <div className="vehicle-metric__meta">{children}</div>
    </article>
  );
}

function DetailStat({ label, value }: { label: string; value: string }) {
  return (
    <span>
      <small>{label}</small>
      <strong className="mono">{value}</strong>
    </span>
  );
}

function formatAddress(address: string | null): string {
  return address?.trim() ? address : "—";
}

function mapHref(latitude: number | null, longitude: number | null): string | null {
  if (latitude == null || longitude == null) {
    return null;
  }
  return `https://www.google.com/maps?q=${latitude},${longitude}`;
}

export default function VehiclePage() {
  return (
    <Suspense fallback={<VehiclePageFallback />}>
      <VehiclePageContent />
    </Suspense>
  );
}

function VehiclePageFallback() {
  return (
    <div className="app-shell">
      <main className="page">
        <div className="content">
          <div className="empty-state">Завантаження…</div>
        </div>
      </main>
    </div>
  );
}

function VehiclePageContent() {
  const router = useRouter();
  const params = useParams<{ vehicleId: string }>();
  const searchParams = useSearchParams();
  const vehicleId = params.vehicleId;
  const initialRange = resolveInitialRange(
    searchParams.get("from"),
    searchParams.get("to"),
  );

  const syncRangeToUrl = useCallback(
    (from: string, to: string) => {
      const next = new URLSearchParams();
      next.set("from", from);
      next.set("to", to);
      router.replace(`/vehicles/${vehicleId}?${next.toString()}`);
    },
    [router, vehicleId],
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
    importActive,
    rangeRunStatus,
    error,
    applyRange,
    applyPreset,
    runVehicleImport,
  } = useVehicleReport({
    vehicleId,
    initialFrom: initialRange.from,
    initialTo: initialRange.to,
    onRangeApplied: syncRangeToUrl,
  });

  const [theme, setTheme] = useState<ThemeMode>("dark");
  const [details, setDetails] = useState<VehicleDetailsResponse | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const vehicle = data?.vehicle;
  const showVehicleDetails = Boolean(data?.partialReady && vehicle);

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

  useEffect(() => {
    if (!showVehicleDetails || !vehicle) {
      setDetails(null);
      setDetailsLoading(false);
      setDetailsError(null);
      return;
    }

    let cancelled = false;

    async function loadDetails(): Promise<void> {
      setDetailsLoading(true);
      setDetailsError(null);
      try {
        const response = await fetch(
          `/api/reports/range/details?vehicleId=${encodeURIComponent(
            vehicleId,
          )}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
        );
        const json = await readJsonResponse<VehicleDetailsResponse>(response);
        if (!cancelled) {
          setDetails(json);
        }
      } catch (loadError) {
        if (!cancelled) {
          setDetails(null);
          setDetailsError(
            loadError instanceof Error
              ? loadError.message
              : "Не вдалося завантажити деталі машини",
          );
        }
      } finally {
        if (!cancelled) {
          setDetailsLoading(false);
        }
      }
    }

    void loadDetails();

    return () => {
      cancelled = true;
    };
  }, [showVehicleDetails, from, to, vehicle, vehicleId]);

  const listHref = `/?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  const segmentCount = details?.segments.length ?? 0;
  const refillCount = details?.refills.length ?? 0;
  const refilledDetailsL =
    details?.refills.reduce((sum, refill) => sum + refill.volumeL, 0) ?? 0;
  const missingRefillDetails =
    showVehicleDetails &&
    !detailsLoading &&
    !detailsError &&
    Boolean(details) &&
    vehicle!.refillCount > 0 &&
    refillCount === 0;
  const mismatchedRefillDetails =
    showVehicleDetails &&
    !detailsLoading &&
    !detailsError &&
    Boolean(details) &&
    vehicle!.refillCount > 0 &&
    (refillCount > vehicle!.refillCount ||
      (refillCount > 0 &&
        vehicle!.refilledL > 0 &&
        Math.abs(refilledDetailsL - vehicle!.refilledL) / vehicle!.refilledL > 0.1));

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
          <nav className="breadcrumbs" aria-label="breadcrumb">
            <Link href={listHref}>Зведені звіти</Link>
            <ChevronRight size={14} aria-hidden />
            <span aria-current="page">
              {vehicle?.vehicle.displayName ?? "Машина"}
            </span>
          </nav>

          <section className="report-hero">
            <div className="report-hero__copy">
              <h2>{vehicle?.vehicle.displayName ?? "Машина"}</h2>
              <p>
                Період{" "}
                <span className="mono">
                  {formatDate(from)} — {formatDate(to)}
                </span>
                . Детальний звіт по машині.
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
            vehicleId={vehicleId}
            loading={loading}
            mutating={mutating}
            ready={Boolean(data?.ready)}
            scope="vehicle"
            runStatus={rangeRunStatus}
            onImport={() => void runVehicleImport("missing")}
            onForceReload={() => void runVehicleImport("force")}
            onRetry={() => void runVehicleImport("missing", true)}
          />

          {data?.partialReady &&
          !data.ready &&
          (mutating || importActive) ? (
            <div className="provisional-banner">
              <Clock3 size={16} />
              Готово не всі дати для цієї машини. Решта довантажується у фоні.
            </div>
          ) : null}

          {loading ? (
            <section className="panel vehicle-page-placeholder">
              <p className="muted">Завантажую дані…</p>
            </section>
          ) : null}

          {!loading && data && !data.partialReady ? (
            <section className="panel vehicle-page-placeholder">
              <p className="muted">
                Для детального звіту потрібно завантажити дані за вибраний
                період.
              </p>
            </section>
          ) : null}

          {!loading && data?.partialReady && !vehicle ? (
            <section className="panel vehicle-page-placeholder">
              <p className="muted">Машину не знайдено у вибраному періоді.</p>
            </section>
          ) : null}

          {showVehicleDetails && vehicle ? (
            <>
              {detailsError ? (
                <div className="error-banner">{detailsError}</div>
              ) : null}

              {missingRefillDetails ? (
                <div className="provisional-banner">
                  <AlertTriangle size={16} />
                  У статистиці є заправки, але немає деталізації місця.
                  Спробуй повністю перезавантажити дані за період.
                </div>
              ) : null}

              {mismatchedRefillDetails ? (
                <div className="provisional-banner">
                  <AlertTriangle size={16} />
                  Кількість або обсяг заправок у списку не збігається зі
                  зведенням. Перезавантаж дані за період, щоб оновити
                  деталізацію.
                </div>
              ) : null}

              <section className="vehicle-metric-grid" aria-label="Показники машини">
                <VehicleMetricCard
                  icon={<Route size={18} />}
                  label="Пройдена відстань"
                  value={formatNum(vehicle.mileageKm, " km")}
                >
                  <DetailStat
                    label="Сегментів"
                    value={detailsLoading ? "…" : segmentCount.toString()}
                  />
                </VehicleMetricCard>

                <VehicleMetricCard
                  icon={<Fuel size={18} />}
                  label="Витрати палива"
                  value={formatNum(vehicle.fuelConsumedL, " l")}
                >
                  <DetailStat
                    label="Заправок"
                    value={vehicle.refillCount.toString()}
                  />
                  <DetailStat label="Залито" value={formatNum(vehicle.refilledL, " l")} />
                </VehicleMetricCard>

                <VehicleMetricCard
                  icon={<Gauge size={18} />}
                  label="Середня швидкість"
                  value={formatNum(vehicle.averageSpeedKmh, " km/h")}
                >
                  <DetailStat
                    label="Час руху"
                    value={formatDuration(vehicle.movementDurationSeconds)}
                  />
                </VehicleMetricCard>

                <VehicleMetricCard
                  icon={<Truck size={18} />}
                  label="Середня витрата пального"
                  value={formatNum(vehicle.consumptionLPer100Km, " l/100km")}
                >
                  <DetailStat
                    label="Останні 1000 км"
                    value={formatNum(
                      vehicle.rolling1000KmConsumptionLPer100Km,
                      " l/100km",
                    )}
                  />
                </VehicleMetricCard>
              </section>

              <section className="report-section" aria-label="Сегменти-поїздки">
                <div className="section-heading">
                  <div>
                    <h3>Сегменти-поїздки</h3>
                    <p className="muted">
                      Дані з Trips report за {formatDate(from)} — {formatDate(to)}
                    </p>
                  </div>
                  <Badge>
                    <Route size={13} />
                    {detailsLoading ? "…" : segmentCount} сегментів
                  </Badge>
                </div>
                <div className="panel table-shell vehicle-detail-table-shell">
                  {detailsLoading ? (
                    <div className="inline-loading">Завантажую сегменти…</div>
                  ) : details?.segments.length ? (
                    <VehicleSegmentsTable segments={details.segments} />
                  ) : (
                    <div className="empty-state empty-state--table">
                      Сегментів за цей період немає.
                    </div>
                  )}
                </div>
              </section>

              <section className="report-section" aria-label="Заправки">
                <div className="section-heading">
                  <div>
                    <h3>Заправки</h3>
                    <p className="muted">Де заправлявся і скільки було залито.</p>
                  </div>
                  <Badge>
                    <Fuel size={13} />
                    {detailsLoading ? "…" : refillCount} подій
                  </Badge>
                </div>
                <div className="panel vehicle-refill-list">
                  {detailsLoading ? (
                    <div className="inline-loading">Завантажую заправки…</div>
                  ) : details?.refills.length ? (
                    details.refills.map((refill) => {
                      const href = mapHref(refill.latitude, refill.longitude);
                      return (
                        <article className="vehicle-refill-item" key={refill.id}>
                          <div>
                            <strong className="mono">{formatNum(refill.volumeL, " l")}</strong>
                            <span className="mono">{formatTime(refill.eventTime)}</span>
                          </div>
                          <p>{formatAddress(refill.address)}</p>
                          {href ? (
                            <a
                              className="button button--ghost"
                              href={href}
                              target="_blank"
                              rel="noreferrer"
                            >
                              <MapPin size={15} />
                              Мапа
                            </a>
                          ) : (
                            <span className="muted">Координат немає</span>
                          )}
                        </article>
                      );
                    })
                  ) : (
                    <div className="empty-state empty-state--table">
                      Заправок за цей період немає.
                    </div>
                  )}
                </div>
              </section>
            </>
          ) : null}
        </div>
      </main>
    </div>
  );
}
