"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  RefreshCw,
} from "lucide-react";
import { Badge } from "@/components/Badge";
import { isQueueItemClaimable } from "@/lib/report/coverage";
import { coverageLabel, formatDate, formatTime, readJsonResponse } from "@/lib/report/format";
import { resolveImportButtonState } from "@/lib/report/import-button-state";
import type {
  CoverageDay,
  CoverageDiagnosticsDay,
  CoverageDiagnosticsResponse,
  RunRangeIdleReason,
} from "@/lib/report/types";

type CoveragePanelProps = {
  coverage: CoverageDay[];
  from: string;
  to: string;
  vehicleId?: string;
  loading: boolean;
  mutating: boolean;
  ready: boolean;
  runStatus: string | null;
  stuck?: boolean;
  lastIdleReason?: RunRangeIdleReason | null;
  scope?: "fleet" | "vehicle";
  onImport: () => void;
  onForceReload: () => void;
  onRetry: () => void;
  onRestart?: () => void;
  onRefreshToday?: () => void;
};

function coverageDayProgress(day: CoverageDay): number {
  if (day.ready) {
    return 1;
  }
  if (
    day.expectedVehicles > 0 &&
    (day.state === "running" ||
      day.state === "partial" ||
      day.state === "queued")
  ) {
    const ratio = day.successfulVehicles / day.expectedVehicles;
    return Math.min(0.99, Math.max(0, ratio));
  }
  return 0;
}

function vehicleStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending: "очікує",
    running: "завантаження",
    completed: "готово",
    failed: "помилка",
  };
  return labels[status] ?? status;
}

function idleReasonLabel(reason: RunRangeIdleReason): string {
  const labels: Record<RunRangeIdleReason, string> = {
    deadline: "м'який дедлайн вичерпано",
    empty: "немає дат у черзі для вибраного періоду",
    backoff: "очікування наступної спроби",
    exhausted: "спроби черги вичерпано",
    out_of_range: "немає доступних дат у черзі",
  };
  return labels[reason];
}

function queueRetryMeta(day: CoverageDay): string | null {
  if (day.queueStatus !== "pending" || !day.queueRunAfter) {
    return null;
  }
  if (isQueueItemClaimable(day)) {
    return null;
  }
  const attemptLabel =
    day.queueAttempts > 0 ? ` · спроба ${day.queueAttempts}/3` : "";
  return `наступна спроба о ${formatTime(day.queueRunAfter)}${attemptLabel}`;
}

function displayQueueError(day: CoverageDay): string | null {
  if (!day.lastError || day.lastError === "partial") {
    return null;
  }
  return day.lastError;
}

function CoverageDayRow({
  day,
  from,
  to,
  vehicleId,
  isVehicleScope,
  expanded,
  lastIdleReason,
  onToggle,
}: {
  day: CoverageDay;
  from: string;
  to: string;
  vehicleId?: string;
  isVehicleScope: boolean;
  expanded: boolean;
  lastIdleReason?: RunRangeIdleReason | null;
  onToggle: () => void;
}) {
  const [diagnostics, setDiagnostics] = useState<CoverageDiagnosticsDay | null>(
    null,
  );
  const [loadingDiagnostics, setLoadingDiagnostics] = useState(false);
  const expandable =
    !isVehicleScope &&
    (day.state === "partial" ||
      day.state === "failed" ||
      day.state === "queued" ||
      day.state === "running" ||
      day.state === "missing");
  const showVehicleProgress =
    !isVehicleScope &&
    day.expectedVehicles > 0 &&
    (!day.ready ||
      day.successfulVehicles < day.expectedVehicles ||
      day.state === "failed" ||
      day.state === "partial");
  const showQueueMeta =
    !isVehicleScope &&
    (day.state === "missing" ||
      day.state === "queued" ||
      day.state === "running" ||
      day.queueStatus != null);

  const loadDiagnostics = useCallback(async (): Promise<void> => {
    setLoadingDiagnostics(true);
    try {
      const response = await fetch(
        `/api/reports/range/diagnostics?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&date=${encodeURIComponent(day.date)}`,
      );
      const json = await readJsonResponse<CoverageDiagnosticsResponse>(response);
      setDiagnostics(json.days[0] ?? null);
    } catch {
      setDiagnostics(null);
    } finally {
      setLoadingDiagnostics(false);
    }
  }, [day.date, from, to]);

  useEffect(() => {
    if (expanded && expandable && diagnostics == null && !loadingDiagnostics) {
      void loadDiagnostics();
    }
  }, [diagnostics, expandable, expanded, loadDiagnostics, loadingDiagnostics]);

  const failedFleetVehicles =
    diagnostics?.failedVehicles.filter(
      (vehicle) => !vehicleId || vehicle.vehicleId === vehicleId,
    ) ?? [];
  const summaryLine =
    failedFleetVehicles.length > 0
      ? failedFleetVehicles
          .map(
            (vehicle) =>
              `${vehicle.displayName}${vehicle.lastError ? ` — ${vehicle.lastError}` : ""}`,
          )
          .join("; ")
      : null;
  const retryMeta = queueRetryMeta(day);
  const queueError = displayQueueError(day);

  return (
    <div
      className={`coverage-day coverage-day--${day.state}${
        expanded ? " coverage-day--expanded" : ""
      }`}
    >
      <button
        className={`coverage-day__trigger${expandable ? "" : " coverage-day__trigger--static"}`}
        type="button"
        disabled={!expandable}
        aria-expanded={expandable ? expanded : undefined}
        onClick={expandable ? onToggle : undefined}
      >
        <div className="coverage-day__main">
          <span className="coverage-day__date mono">{formatDate(day.date)}</span>
          <Badge
            tone={
              day.ready
                ? "success"
                : day.state === "failed" || day.state === "partial"
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
            {retryMeta ? ` · ${retryMeta}` : ""}
          </span>
        ) : showQueueMeta ? (
          <span className="coverage-day__meta mono">
            {day.state === "missing"
              ? "дані не завантажені"
              : day.queueAttempts > 0
                ? `спроба ${day.queueAttempts}/3`
                : "у черзі"}
            {retryMeta ? ` · ${retryMeta}` : ""}
            {day.queueRunAfter && isQueueItemClaimable(day)
              ? " · готова до запуску"
              : null}
          </span>
        ) : retryMeta ? (
          <span className="coverage-day__meta mono">{retryMeta}</span>
        ) : null}
        {summaryLine ? (
          <small className="coverage-day__summary" title={summaryLine}>
            Не завантажено: {summaryLine}
          </small>
        ) : queueError ? (
          <small title={queueError}>{queueError}</small>
        ) : null}
        {expandable ? (
          <span className="coverage-day__chevron" aria-hidden>
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </span>
        ) : null}
      </button>
      {expanded && expandable ? (
        <div className="coverage-day__details">
          {loadingDiagnostics ? (
            <p className="coverage-day__details-loading">Завантажую деталі…</p>
          ) : failedFleetVehicles.length > 0 ? (
            <ul className="coverage-day__vehicle-list">
              {failedFleetVehicles.map((vehicle) => (
                <li key={vehicle.vehicleId}>
                  <span className="mono">{vehicle.displayName}</span>
                  <Badge tone="danger">{vehicleStatusLabel(vehicle.status)}</Badge>
                  {vehicle.lastError ? (
                    <span className="coverage-day__vehicle-error" title={vehicle.lastError}>
                      {vehicle.lastError}
                    </span>
                  ) : null}
                  {vehicle.attempts > 0 ? (
                    <span className="coverage-day__vehicle-attempts mono">
                      спроб: {vehicle.attempts}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : diagnostics?.retryExhausted ? (
            <p className="coverage-day__details-note">
              Спроби черги вичерпано ({diagnostics.queueAttempts}/3).
              {diagnostics.queueLastError
                ? ` Остання помилка: ${diagnostics.queueLastError}`
                : null}
            </p>
          ) : day.state === "missing" ? (
            <p className="coverage-day__details-note">
              Дані за цю дату ще не завантажені. Натисни «Завантажити дані для звіту».
            </p>
          ) : day.state === "queued" || day.state === "running" ? (
            <p className="coverage-day__details-note">
              Статус черги: {day.queueStatus ?? "немає"}.
              {day.queueAttempts > 0 ? ` Спроб: ${day.queueAttempts}/3.` : null}
              {day.queueRunAfter
                ? ` Наступний запуск: ${formatTime(day.queueRunAfter)}.`
                : null}
              {lastIdleReason
                ? ` Остання причина idle: ${idleReasonLabel(lastIdleReason)}.`
                : null}
            </p>
          ) : (
            <p className="coverage-day__details-note">
              Немає деталей по машинах для цієї дати.
            </p>
          )}
          {diagnostics?.recentEvents && diagnostics.recentEvents.length > 0 ? (
            <ul className="coverage-day__event-list">
              {diagnostics.recentEvents.slice(0, 5).map((event) => (
                <li key={event.id} className="mono">
                  {formatTime(event.createdAt)} {event.eventType}
                  {event.message ? ` — ${event.message}` : ""}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function CoveragePanel({
  coverage,
  from,
  to,
  vehicleId,
  loading,
  mutating,
  ready: rangeReady,
  runStatus,
  stuck = false,
  lastIdleReason = null,
  scope = "fleet",
  onImport,
  onForceReload,
  onRetry,
  onRestart,
  onRefreshToday,
}: CoveragePanelProps) {
  const readyCount = coverage.filter((day) => day.ready).length;
  const failed = coverage.filter((day) => day.state === "failed");
  const partialDays = coverage.filter((day) => day.state === "partial");
  const problemDays = [...failed, ...partialDays];
  const queued = coverage.filter((day) => day.state === "queued").length;
  const running = coverage.filter((day) => day.state === "running").length;
  const partial = partialDays.length;
  const missing = coverage.filter((day) => day.state === "missing").length;
  const retryExhausted = coverage.some(
    (day) =>
      (day.state === "partial" || day.state === "failed") &&
      day.queueAttempts >= 3,
  );
  const waitingBackoff = coverage.some(
    (day) =>
      day.queueStatus === "pending" &&
      day.queueRunAfter != null &&
      !isQueueItemClaimable(day),
  );
  const buttonState = resolveImportButtonState({
    coverage,
    mutating,
    stuck,
  });
  const activeWork =
    mutating || running > 0 || (partial > 0 && !waitingBackoff);
  const percent =
    coverage.length > 0
      ? Math.round(
          (coverage.reduce((sum, day) => sum + coverageDayProgress(day), 0) /
            coverage.length) *
            100,
        )
      : 0;
  const activeVehicleDay = coverage.find(
    (day) =>
      day.expectedVehicles > 0 &&
      (day.state === "running" ||
        day.state === "queued" ||
        (day.state === "partial" &&
          day.successfulVehicles + day.failedVehicles < day.expectedVehicles)),
  );
  const fleetVehicleProgress =
    activeVehicleDay && activeVehicleDay.expectedVehicles > 0
      ? `${activeVehicleDay.successfulVehicles} з ${activeVehicleDay.expectedVehicles} авто`
      : null;
  const currentVehicleNames =
    activeVehicleDay?.currentVehicles
      ?.map((vehicle) => vehicle.displayName)
      .join(", ") ?? null;
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
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  const isVehicleScope = scope === "vehicle";
  const readyLabel = isVehicleScope ? "дат для машини" : "готово";
  const title = loading
    ? "Перевіряю статус даних"
    : stuck
      ? "Завантаження не прогресує"
      : problemDays.length > 0 && waitingBackoff && running === 0
        ? "Очікування повтору завантаження"
        : problemDays.length > 0
          ? "Є помилки завантаження"
          : activeWork
            ? isVehicleScope
              ? "Завантаження даних для машини"
              : "Завантаження в процесі"
            : queued > 0
              ? "Завантаження дат з черги"
              : missing > 0
                ? isVehicleScope
                  ? "Потрібно завантажити дати для машини"
                  : "Потрібно завантажити дані"
                : (rangeReady || readyCount === coverage.length) &&
                    coverage.length > 0
                  ? isVehicleScope
                    ? "Дані машини завантажені"
                    : "Дані завантажені"
                  : "Очікую готовність даних";
  const description = loading
    ? isVehicleScope
      ? "Зараз читаю наявні дати для цієї машини."
      : "Зараз читаю coverage по вибраному періоду."
    : stuck
      ? `Завантаження для вибраного періоду не прогресує${lastIdleReason ? ` (${idleReasonLabel(lastIdleReason)})` : ""}. Розгорни дату для подій або натисни «Перезапустити дату».`
      : problemDays.length > 0
        ? retryExhausted
          ? "Частина дат не завантажилась після кількох спроб. Розгорни дату, щоб побачити проблемні машини, або натисни «Спробувати проблемні машини»."
          : waitingBackoff
            ? "Частина машин не завантажилась. Наступна спроба запланована автоматично — час видно на картці дати."
            : "Натисни «Довантажити дані», щоб завантажити відсутні дані та знову запустити проблемні дати. Розгорни дату для деталей по машинах."
        : activeWork
          ? (runStatus ??
            (currentVehicleNames
              ? `Зараз: ${currentVehicleNames}`
              : fleetVehicleProgress
                ? `Прогрес: ${fleetVehicleProgress}`
                : isVehicleScope
                  ? "Імпорт іде лише для цієї машини."
                  : "Імпорт іде, сторінка оновлює статус автоматично."))
          : queued > 0
            ? waitingBackoff
              ? "Дата в черзі, але наступний запуск ще не настав. Можна натиснути «Спробувати зараз»."
              : "Наступні дати обробляються автоматично. Сторінку можна не закривати."
            : missing > 0
              ? isVehicleScope
                ? "Натисни «Завантажити дані для звіту» — підтягнеться лише ця машина."
                : "Натисни «Завантажити дані для звіту» — дати потраплять у чергу і перша одразу стартує."
              : coverage.length > 0
                ? isVehicleScope
                  ? "Усі дати для машини в цьому періоді готові."
                  : "Усі доступні дати для вибраного періоду готові."
                : "Після вибору періоду тут з'явиться статус завантаження.";

  useEffect(() => {
    setStatusCollapsed(allDataAvailable);
  }, [allDataAvailable, coverageSignature]);

  useEffect(() => {
    setExpandedDate(null);
  }, [coverageSignature, from, to]);

  function handlePrimaryAction(): void {
    switch (buttonState.primaryAction) {
      case "retry":
        onRetry();
        break;
      case "retryNow":
        (onRestart ?? onForceReload)();
        break;
      case "restart":
        (onRestart ?? onForceReload)();
        break;
      case "import":
      default:
        onImport();
        break;
    }
  }

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
            <strong>
              {readyCount}/{coverage.length || "—"}
            </strong>
            <span>{percent}% {readyLabel}</span>
            {fleetVehicleProgress && activeWork ? (
              <span className="coverage-total__vehicles">{fleetVehicleProgress}</span>
            ) : null}
          </div>
          <button
            className="button button--ghost icon-button status-panel__toggle"
            type="button"
            aria-controls="coverage-status-panel-details"
            aria-expanded={!statusCollapsed}
            aria-label={
              statusCollapsed ? "Розгорнути статус даних" : "Згорнути статус даних"
            }
            title={
              statusCollapsed ? "Розгорнути статус даних" : "Згорнути статус даних"
            }
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
              {coverage.map((day) => (
                <CoverageDayRow
                  key={day.date}
                  day={day}
                  from={from}
                  to={to}
                  vehicleId={vehicleId}
                  isVehicleScope={isVehicleScope}
                  expanded={expandedDate === day.date}
                  lastIdleReason={lastIdleReason}
                  onToggle={() =>
                    setExpandedDate((current) =>
                      current === day.date ? null : day.date,
                    )
                  }
                />
              ))}
            </div>
          ) : (
            <div className="empty-state empty-state--compact">
              {loading ? "Завантажую статус дат..." : "Немає статусів для вибраного періоду."}
            </div>
          )}
        </div>
        <div className="status-actions">
          {problemDays.length > 0 ? (
            <>
              <span className="status-actions__note">
                <AlertTriangle size={15} />
                Проблемних дат: <strong>{problemDays.length}</strong>
                {retryExhausted ? " (спроби вичерпано)" : null}
              </span>
              <button
                className="button button--primary"
                type="button"
                disabled={mutating}
                onClick={handlePrimaryAction}
              >
                <RefreshCw
                  className={buttonState.showSpinner ? "spin" : undefined}
                  size={16}
                />
                {buttonState.primaryLabel}
              </button>
            </>
          ) : (
            <button
              className="button button--primary"
              type="button"
              disabled={loading || mutating}
              onClick={handlePrimaryAction}
            >
              {buttonState.showSpinner ? (
                <RefreshCw className="spin" size={16} />
              ) : (
                <CheckCircle2 size={16} />
              )}
              {buttonState.primaryLabel}
            </button>
          )}
          <button
            className="button button--ghost"
            type="button"
            disabled={loading || mutating}
            onClick={onForceReload}
          >
            <RefreshCw size={16} />
            Повністю перезавантажити{isVehicleScope ? " машину" : ""}
          </button>
          {onRefreshToday ? (
            <button
              className="button button--ghost"
              type="button"
              disabled={loading || mutating}
              onClick={onRefreshToday}
            >
              <RefreshCw size={16} />
              Оновити сьогодні
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
