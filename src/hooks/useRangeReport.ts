"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  dateDaysAgo,
  getKyivDate,
  POLL_INTERVAL_MS,
} from "@/lib/report/dates";
import { formatDate, readJsonResponse } from "@/lib/report/format";
import type {
  EnsureRangeResponse,
  RangeResponse,
  RunRangeResponse,
} from "@/lib/report/types";

type UseRangeReportOptions = {
  initialFrom: string;
  initialTo: string;
  onRangeApplied?: (from: string, to: string) => void;
};

export function useRangeReport({
  initialFrom,
  initialTo,
  onRangeApplied,
}: UseRangeReportOptions) {
  const [draftFrom, setDraftFrom] = useState(initialFrom);
  const [draftTo, setDraftTo] = useState(initialTo);
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [data, setData] = useState<RangeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [mutating, setMutating] = useState(false);
  const [rangeRunStatus, setRangeRunStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mutatingRef = useRef(false);
  const kickingRef = useRef(false);

  mutatingRef.current = mutating;

  useEffect(() => {
    setDraftFrom(initialFrom);
    setDraftTo(initialTo);
    setFrom(initialFrom);
    setTo(initialTo);
  }, [initialFrom, initialTo]);

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

  function applyRange(): void {
    setError(null);
    setData(null);
    setRangeRunStatus(null);
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
    onRangeApplied?.(start, end);
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
    rangeRunStatus,
    error,
    applyRange,
    applyPreset,
    runRangeImport,
    runMutation,
    load,
  };
}
