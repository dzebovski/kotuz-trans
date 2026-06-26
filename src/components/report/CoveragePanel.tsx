"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  RefreshCw,
} from "lucide-react";
import { Badge } from "@/components/Badge";
import { coverageLabel, formatDate } from "@/lib/report/format";
import type { CoverageDay } from "@/lib/report/types";

type CoveragePanelProps = {
  coverage: CoverageDay[];
  loading: boolean;
  mutating: boolean;
  ready: boolean;
  runStatus: string | null;
  onImport: () => void;
  onForceReload: () => void;
  onRetry: () => void;
  onRefreshToday?: () => void;
};

export function CoveragePanel({
  coverage,
  loading,
  mutating,
  ready: rangeReady,
  runStatus,
  onImport,
  onForceReload,
  onRetry,
  onRefreshToday,
}: CoveragePanelProps) {
  const readyCount = coverage.filter((day) => day.ready).length;
  const failed = coverage.filter((day) => day.state === "failed");
  const queued = coverage.filter((day) => day.state === "queued").length;
  const running = coverage.filter((day) => day.state === "running").length;
  const partial = coverage.filter((day) => day.state === "partial").length;
  const missing = coverage.filter((day) => day.state === "missing").length;
  const activeWork = mutating || running + partial > 0;
  const importActive = activeWork || queued > 0;
  const percent =
    coverage.length > 0 ? Math.round((readyCount / coverage.length) * 100) : 0;
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
            <strong>
              {readyCount}/{coverage.length || "—"}
            </strong>
            <span>{percent}% готово</span>
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
              <button
                className="button button--primary"
                type="button"
                disabled={mutating}
                onClick={onRetry}
              >
                <RefreshCw className={mutating ? "spin" : undefined} size={16} />
                Повторити
              </button>
            </>
          ) : (
            <button
              className="button button--primary"
              type="button"
              disabled={loading || mutating}
              onClick={onImport}
            >
              {importActive ? (
                <RefreshCw className="spin" size={16} />
              ) : (
                <CheckCircle2 size={16} />
              )}
              {missing > 0 ? "Завантажити дані для звіту" : "Довантажити пропущені"}
            </button>
          )}
          <button
            className="button button--ghost"
            type="button"
            disabled={loading || mutating}
            onClick={onForceReload}
          >
            <RefreshCw size={16} />
            Повністю перезавантажити
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
