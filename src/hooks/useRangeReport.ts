import { useCallback, useEffect, useRef, useState } from "react";
import {
  hasClaimableQueuedDates,
  isImportActive,
  nextFleetPollDelayMs,
  resolveFleetImportKickAction,
} from "@/lib/report/coverage";
import {
  dateDaysAgo,
  CHUNK_KICK_DELAY_MS,
  getKyivDate,
} from "@/lib/report/dates";
import { fleetDebug } from "@/lib/report/debug";
import { formatDate, readJsonResponse } from "@/lib/report/format";
import {
  isAbortError,
  shouldApplyRangeResponse,
  toRangeKey,
} from "@/lib/report/range-request";
import type {
  EnsureRangeResponse,
  RangeResponse,
  RangeStatusResponse,
  RunRangeIdleReason,
  RunRangeResponse,
} from "@/lib/report/types";

type UseRangeReportOptions = {
  initialFrom: string;
  initialTo: string;
  onRangeApplied?: (from: string, to: string) => void;
};

const STUCK_IDLE_KICK_THRESHOLD = 3;

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
  const [lastIdleReason, setLastIdleReason] = useState<RunRangeIdleReason | null>(
    null,
  );
  const [stuck, setStuck] = useState(false);
  const mutatingRef = useRef(false);
  const pollingRef = useRef(false);
  const kickInFlightRef = useRef(false);
  const inflightLoadRef = useRef<Promise<RangeResponse | null> | null>(null);
  const initialLoadKeyRef = useRef<string | null>(null);
  const readyCountRef = useRef(0);
  const idleKickCountRef = useRef(0);
  const rangeKeyRef = useRef(toRangeKey(initialFrom, initialTo));
  const abortControllerRef = useRef<AbortController | null>(null);
  const fromRef = useRef(from);
  const toRef = useRef(to);

  mutatingRef.current = mutating;
  fromRef.current = from;
  toRef.current = to;

  useEffect(() => {
    setDraftFrom(initialFrom);
    setDraftTo(initialTo);
    setFrom(initialFrom);
    setTo(initialTo);
    setData(null);
    setRangeRunStatus(null);
    setError(null);
    setLastIdleReason(null);
    setStuck(false);
    idleKickCountRef.current = 0;
  }, [initialFrom, initialTo]);

  useEffect(() => {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    rangeKeyRef.current = toRangeKey(from, to);
    idleKickCountRef.current = 0;
    initialLoadKeyRef.current = null;
    setStuck(false);
    setLastIdleReason(null);

    return () => {
      controller.abort();
    };
  }, [from, to]);

  const isCurrentRange = useCallback(
    (requestedFrom: string, requestedTo: string, rangeKey: string): boolean => {
      return (
        rangeKeyRef.current === rangeKey &&
        shouldApplyRangeResponse(
          requestedFrom,
          requestedTo,
          fromRef.current,
          toRef.current,
        )
      );
    },
    [],
  );

  const load = useCallback(
    async (silent = false): Promise<RangeResponse | null> => {
      if (inflightLoadRef.current) {
        return inflightLoadRef.current;
      }

      const requestFrom = from;
      const requestTo = to;
      const rangeKey = toRangeKey(requestFrom, requestTo);
      const signal = abortControllerRef.current?.signal;

      const promise = (async (): Promise<RangeResponse | null> => {
        if (!silent) {
          setLoading(true);
          setError(null);
        }
        try {
          const response = await fetch(
            `/api/reports/range?from=${encodeURIComponent(requestFrom)}&to=${encodeURIComponent(requestTo)}`,
            { signal },
          );
          const json = await readJsonResponse<RangeResponse>(response);
          if (!isCurrentRange(requestFrom, requestTo, rangeKey)) {
            return null;
          }
          setData(json);
          readyCountRef.current = json.coverage.filter((day) => day.ready).length;
          return json;
        } catch (loadError) {
          if (isAbortError(loadError)) {
            return null;
          }
          if (!isCurrentRange(requestFrom, requestTo, rangeKey)) {
            return null;
          }
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
          if (!silent && isCurrentRange(requestFrom, requestTo, rangeKey)) {
            setLoading(false);
          }
        }
      })();

      inflightLoadRef.current = promise;
      try {
        return await promise;
      } finally {
        if (inflightLoadRef.current === promise) {
          inflightLoadRef.current = null;
        }
      }
    },
    [from, to, isCurrentRange],
  );

  const loadStatus = useCallback(async (): Promise<RangeStatusResponse | null> => {
    const requestFrom = from;
    const requestTo = to;
    const rangeKey = toRangeKey(requestFrom, requestTo);
    const signal = abortControllerRef.current?.signal;

    try {
      const response = await fetch(
        `/api/reports/range/status?from=${encodeURIComponent(requestFrom)}&to=${encodeURIComponent(requestTo)}`,
        { signal },
      );
      const json = await readJsonResponse<RangeStatusResponse>(response);
      if (!isCurrentRange(requestFrom, requestTo, rangeKey)) {
        return null;
      }

      const nextReadyCount = json.coverage.filter((day) => day.ready).length;
      const readyCountIncreased = nextReadyCount > readyCountRef.current;
      readyCountRef.current = nextReadyCount;

      if (readyCountIncreased) {
        idleKickCountRef.current = 0;
        setStuck(false);
        await load(true);
        return json;
      }

      setData((current) =>
        current && isCurrentRange(requestFrom, requestTo, rangeKey)
          ? {
              ...current,
              ready: json.ready,
              partialReady: json.partialReady,
              coverage: json.coverage,
            }
          : current,
      );
      return json;
    } catch (statusError) {
      if (isAbortError(statusError)) {
        return null;
      }
      return null;
    }
  }, [from, to, isCurrentRange, load]);

  useEffect(() => {
    const key = toRangeKey(from, to);
    if (initialLoadKeyRef.current === key) {
      return;
    }
    initialLoadKeyRef.current = key;
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

  const retryPartialDates = useCallback(async (): Promise<EnsureRangeResponse> => {
    const response = await fetch("/api/reports/range/ensure", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        from,
        to,
        mode: "missing",
        retryFailed: true,
      }),
    });
    return readJsonResponse<EnsureRangeResponse>(response);
  }, [from, to]);

  const shouldPollCoverage = Boolean(
    data && !data.ready && (mutating || isImportActive(data.coverage)),
  );

  const recordKickResult = useCallback(
    (
      coverage: RangeStatusResponse["coverage"],
      result: RunRangeResponse,
    ): void => {
      setLastIdleReason(result.idleReason ?? null);
      fleetDebug("range_run_result", {
        status: result.status,
        reportDate: result.reportDate,
        reason: result.reason,
        idleReason: result.idleReason,
        readyCount: readyCountRef.current,
      });

      if (result.status === "running") {
        idleKickCountRef.current = 0;
        setStuck(false);
        return;
      }

      if (result.status !== "idle") {
        idleKickCountRef.current = 0;
        setStuck(false);
        return;
      }

      const claimable = hasClaimableQueuedDates(coverage);
      if (!claimable) {
        idleKickCountRef.current = 0;
        setStuck(false);
        return;
      }

      idleKickCountRef.current += 1;
      const nextStuck =
        idleKickCountRef.current >= STUCK_IDLE_KICK_THRESHOLD ||
        result.idleReason === "exhausted";
      setStuck(nextStuck);
      fleetDebug("range_run_stuck_check", {
        idleKickCount: idleKickCountRef.current,
        stuck: nextStuck,
        idleReason: result.idleReason,
      });
    },
    [],
  );

  useEffect(() => {
    if (!shouldPollCoverage) {
      return;
    }

    let cancelled = false;
    let timeoutId: number | null = null;

    const scheduleNext = (
      coverage: RangeStatusResponse["coverage"],
      delayMs?: number,
    ): void => {
      if (cancelled) {
        return;
      }
      timeoutId = window.setTimeout(() => {
        void tick();
      }, delayMs ?? nextFleetPollDelayMs(coverage));
    };

    const tick = async (): Promise<void> => {
      if (cancelled || pollingRef.current) {
        return;
      }

      pollingRef.current = true;
      try {
        const json = await loadStatus();
        if (cancelled || !json || json.ready) {
          return;
        }

        if (kickInFlightRef.current) {
          scheduleNext(json.coverage);
          return;
        }

        if (mutatingRef.current) {
          scheduleNext(json.coverage);
          return;
        }

        const action = resolveFleetImportKickAction(json.coverage);
        fleetDebug("range_poll_tick", {
          action: action.type,
          readyCount: readyCountRef.current,
          coverageStates: json.coverage.map((day) => ({
            date: day.date,
            state: day.state,
            queueStatus: day.queueStatus,
            queueAttempts: day.queueAttempts,
          })),
        });

        if (action.type === "none") {
          scheduleNext(json.coverage);
          return;
        }

        if (action.type === "retry_partial") {
          setRangeRunStatus("Повторюю частково завантажені дати…");
          await retryPartialDates();
        } else {
          setRangeRunStatus("Обробляю наступну дату з черги…");
        }

        kickInFlightRef.current = true;
        let result: RunRangeResponse;
        try {
          result = await kickNextQueuedDate();
        } finally {
          kickInFlightRef.current = false;
        }
        if (cancelled) {
          return;
        }
        recordKickResult(json.coverage, result);
        const refreshed = await loadStatus();
        if (cancelled || !refreshed || refreshed.ready) {
          return;
        }
        if (result.reportDate) {
          if (result.status === "running" && (result.remaining ?? 0) > 0) {
            setRangeRunStatus(
              `${formatDate(result.reportDate)}: залишилось ${result.remaining} авто…`,
            );
            scheduleNext(refreshed.coverage, CHUNK_KICK_DELAY_MS);
            return;
          }
          setRangeRunStatus(`Оброблено ${formatDate(result.reportDate)}…`);
        }
        scheduleNext(refreshed.coverage);
      } catch (kickError) {
        if (cancelled || isAbortError(kickError)) {
          return;
        }
        setError(
          kickError instanceof Error
            ? kickError.message
            : "Не вдалося обробити дату з черги",
        );
        if (!cancelled) {
          const fallback = await loadStatus();
          if (fallback) {
            scheduleNext(fallback.coverage);
          }
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
  }, [
    shouldPollCoverage,
    kickNextQueuedDate,
    load,
    loadStatus,
    recordKickResult,
    retryPartialDates,
  ]);

  function applyRange(): void {
    abortControllerRef.current?.abort();
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
    abortControllerRef.current?.abort();
    setDraftFrom(start);
    setDraftTo(end);
    setFrom(start);
    setTo(end);
    setData(null);
    setRangeRunStatus(null);
    setError(null);
    onRangeApplied?.(start, end);
  }

  async function runRangeImport(
    mode: "missing" | "force",
    retryFailed = false,
  ): Promise<void> {
    setMutating(true);
    setError(null);
    setStuck(false);
    idleKickCountRef.current = 0;
    setLastIdleReason(null);
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
      fleetDebug("range_ensure_result", ensureResult);
      await loadStatus();
      setRangeRunStatus(
        ensureResult.queued.length > 0
          ? `У черзі ${ensureResult.queued.length} дат. Запускаю обробку…`
          : "Черга вже заповнена. Продовжую обробку…",
      );
    } catch (runError) {
      if (!isAbortError(runError)) {
        setError(
          runError instanceof Error
            ? runError.message
            : "Не вдалося запустити імпорт",
        );
      }
    } finally {
      setMutating(false);
    }
  }

  async function runMutation(action: () => Promise<void>): Promise<void> {
    setMutating(true);
    setError(null);
    try {
      await action();
      await load(true);
    } catch (mutationError) {
      if (!isAbortError(mutationError)) {
        setError(
          mutationError instanceof Error
            ? mutationError.message
            : "Не вдалося виконати дію",
        );
      }
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
    stuck,
    lastIdleReason,
    applyRange,
    applyPreset,
    runRangeImport,
    runMutation,
    load,
  };
}
