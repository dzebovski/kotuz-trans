"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { vehicleImportNeedsPolling } from "@/lib/report/coverage";
import {
  dateDaysAgo,
  getKyivDate,
  POLL_INTERVAL_MS,
} from "@/lib/report/dates";
import { formatDate, readJsonResponse } from "@/lib/report/format";
import type {
  VehicleIngestResponse,
  VehicleReportResponse,
} from "@/lib/report/types";

type UseVehicleReportOptions = {
  vehicleId: string;
  initialFrom: string;
  initialTo: string;
  onRangeApplied?: (from: string, to: string) => void;
};

export function useVehicleReport({
  vehicleId,
  initialFrom,
  initialTo,
  onRangeApplied,
}: UseVehicleReportOptions) {
  const [draftFrom, setDraftFrom] = useState(initialFrom);
  const [draftTo, setDraftTo] = useState(initialTo);
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [data, setData] = useState<VehicleReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [mutating, setMutating] = useState(false);
  const [importActive, setImportActive] = useState(false);
  const [rangeRunStatus, setRangeRunStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mutatingRef = useRef(false);
  const pollingRef = useRef(false);
  const importModeRef = useRef<"missing" | "force">("missing");
  const lastIngestedDateRef = useRef<string | null>(null);

  mutatingRef.current = mutating;

  useEffect(() => {
    setDraftFrom(initialFrom);
    setDraftTo(initialTo);
    setFrom(initialFrom);
    setTo(initialTo);
  }, [initialFrom, initialTo]);

  const load = useCallback(
    async (silent = false): Promise<VehicleReportResponse | null> => {
      if (!silent) {
        setLoading(true);
        setError(null);
      }
      try {
        const response = await fetch(
          `/api/vehicles/${encodeURIComponent(vehicleId)}/report?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
        );
        const json = await readJsonResponse<VehicleReportResponse>(response);
        setData(json);
        if (json.ready) {
          setImportActive(false);
        }
        return json;
      } catch (loadError) {
        if (!silent) {
          setData(null);
        }
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Не вдалося завантажити звіт",
        );
        return null;
      } finally {
        if (!silent) {
          setLoading(false);
        }
      }
    },
    [from, to, vehicleId],
  );

  useEffect(() => {
    void load();
  }, [from, load, to]);

  const ingestNextDate = useCallback(async (): Promise<VehicleIngestResponse> => {
    const response = await fetch(
      `/api/vehicles/${encodeURIComponent(vehicleId)}/ingest`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          from,
          to,
          mode: importModeRef.current,
          afterDate: lastIngestedDateRef.current,
        }),
      },
    );
    return readJsonResponse<VehicleIngestResponse>(response);
  }, [from, to, vehicleId]);

  const shouldPollCoverage = Boolean(
    data &&
      vehicleImportNeedsPolling(data.coverage, data.ready, importActive || mutating),
  );

  useEffect(() => {
    if (!shouldPollCoverage) {
      return;
    }

    let cancelled = false;
    let timeoutId: number | null = null;

    const scheduleNext = (): void => {
      if (cancelled) {
        return;
      }
      timeoutId = window.setTimeout(() => {
        void tick();
      }, POLL_INTERVAL_MS);
    };

    const tick = async (): Promise<void> => {
      if (cancelled || mutatingRef.current || pollingRef.current) {
        return;
      }

      pollingRef.current = true;
      try {
        const json = await load(true);
        if (cancelled || !json || json.ready) {
          if (json?.ready) {
            setImportActive(false);
          }
          return;
        }

        setRangeRunStatus("Завантажую наступну дату для машини…");
        const result = await ingestNextDate();
        if (result.status === "blocked") {
          setImportActive(false);
          setError(
            "Зараз на головній сторінці йде імпорт флоту за цю дату. Дочекайся завершення.",
          );
          return;
        }
        if (result.status === "idle") {
          setImportActive(false);
          setRangeRunStatus(null);
          scheduleNext();
          return;
        }
        if (result.reportDate) {
          lastIngestedDateRef.current = result.reportDate;
          setRangeRunStatus(`Оброблено ${formatDate(result.reportDate)}…`);
        }
        const refreshed = await load(true);
        if (!cancelled && refreshed && !refreshed.ready) {
          scheduleNext();
        }
      } catch (kickError) {
        setImportActive(false);
        setError(
          kickError instanceof Error
            ? kickError.message
            : "Не вдалося завантажити дату",
        );
        if (!cancelled) {
          scheduleNext();
        }
      } finally {
        pollingRef.current = false;
      }
    };

    void tick();
    return () => {
      cancelled = true;
      if (timeoutId != null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [shouldPollCoverage, ingestNextDate, load]);

  function applyRange(): void {
    setError(null);
    setData(null);
    setRangeRunStatus(null);
    setImportActive(false);
    lastIngestedDateRef.current = null;
    setFrom(draftFrom);
    setTo(draftTo);
    onRangeApplied?.(draftFrom, draftTo);
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
    setImportActive(false);
    lastIngestedDateRef.current = null;
    onRangeApplied?.(start, end);
  }

  async function runVehicleImport(
    mode: "missing" | "force",
    retryFailed = false,
  ): Promise<void> {
    setMutating(true);
    setError(null);
    setImportActive(true);
    importModeRef.current = mode;
    lastIngestedDateRef.current = null;
    setRangeRunStatus(
      mode === "force"
        ? "Перезавантажую дані для машини…"
        : retryFailed
          ? "Повторюю проблемні дати…"
          : "Завантажую пропущені дати для машини…",
    );

    try {
      const result = await ingestNextDate();
      if (result.status === "blocked") {
        setImportActive(false);
        setError(
          "Зараз на головній сторінці йде імпорт флоту. Дочекайся завершення.",
        );
        return;
      }
      if (result.status === "idle") {
        setImportActive(false);
      }
      if (result.reportDate) {
        lastIngestedDateRef.current = result.reportDate;
        setRangeRunStatus(`Стартовано ${formatDate(result.reportDate)}.`);
      }
      await load(true);
    } catch (runError) {
      setImportActive(false);
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

  return {
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
  };
}
