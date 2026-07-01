import { POLL_INTERVAL_MS } from "@/lib/report/dates";
import type { CoverageDay, CoverageState } from "@/lib/report/types";

const MAX_BACKOFF_POLL_MS = 60_000;

export function isQueueItemClaimable(
  day: CoverageDay,
  now = Date.now(),
): boolean {
  if (day.queueStatus !== "pending") {
    return false;
  }
  if (!day.queueRunAfter) {
    return true;
  }
  return new Date(day.queueRunAfter).getTime() <= now;
}

export function hasPendingQueue(coverage: CoverageDay[]): boolean {
  return coverage.some(
    (day) => day.queueStatus === "pending" || day.queueStatus === "running",
  );
}

export function hasClaimableQueuedDates(
  coverage: CoverageDay[],
  now = Date.now(),
): boolean {
  return coverage.some((day) => isQueueItemClaimable(day, now));
}

export function isImportActive(coverage: CoverageDay[]): boolean {
  return coverage.some(
    (day) =>
      ["queued", "running", "partial"].includes(day.state) ||
      day.queueStatus === "pending" ||
      day.queueStatus === "running",
  );
}

export function hasActiveRun(coverage: CoverageDay[]): boolean {
  return coverage.some((day) => day.state === "running");
}

export function hasQueuedDates(coverage: CoverageDay[]): boolean {
  return coverage.some((day) => day.state === "queued");
}

export function hasPartialDates(coverage: CoverageDay[]): boolean {
  return coverage.some((day) => day.state === "partial");
}

export function nextFleetPollDelayMs(
  coverage: CoverageDay[],
  now = Date.now(),
): number {
  let delayMs = POLL_INTERVAL_MS;

  for (const day of coverage) {
    if (day.queueStatus === "pending" && day.queueRunAfter) {
      const untilClaim = new Date(day.queueRunAfter).getTime() - now;
      if (untilClaim > POLL_INTERVAL_MS) {
        delayMs = Math.max(delayMs, Math.min(untilClaim, MAX_BACKOFF_POLL_MS));
      }
    }
  }

  return delayMs;
}

export function vehicleImportNeedsPolling(
  coverage: CoverageDay[],
  ready: boolean,
  importActive: boolean,
): boolean {
  if (ready) {
    return false;
  }
  return importActive;
}

export function vehicleForceImportHasRemainingDates(input: {
  coverage: CoverageDay[];
  afterDate: string | null;
}): boolean {
  const dates = input.coverage.map((day) => day.date);
  const coverageByDate = new Map(
    input.coverage.map((day) => [
      day.date,
      {
        ready: day.ready,
        state: day.state,
        fleetRunning: day.state === "running",
      },
    ]),
  );

  const startIndex =
    input.afterDate != null
      ? Math.max(0, dates.indexOf(input.afterDate) + 1)
      : 0;

  for (let index = startIndex; index < dates.length; index += 1) {
    const date = dates[index]!;
    const day = coverageByDate.get(date);
    if (!day) {
      continue;
    }
    if (day.fleetRunning) {
      return false;
    }
    return true;
  }

  return false;
}

export function vehicleImportShouldPoll(input: {
  coverage: CoverageDay[];
  ready: boolean;
  importActive: boolean;
  mode: "missing" | "force";
  afterDate: string | null;
  forceAwaitingIdle: boolean;
}): boolean {
  if (!input.importActive) {
    return false;
  }
  if (input.mode === "force") {
    return (
      input.forceAwaitingIdle ||
      vehicleForceImportHasRemainingDates({
        coverage: input.coverage,
        afterDate: input.afterDate,
      })
    );
  }
  return vehicleImportNeedsPolling(
    input.coverage,
    input.ready,
    input.importActive,
  );
}

export function fleetKickShouldRun(coverage: CoverageDay[]): boolean {
  return hasClaimableQueuedDates(coverage);
}

export function fleetRetryPartialNeeded(coverage: CoverageDay[]): boolean {
  return (
    hasPartialDates(coverage) &&
    !hasActiveRun(coverage) &&
    !hasPendingQueue(coverage)
  );
}

export type FleetImportKickAction =
  | { type: "kick" }
  | { type: "retry_partial" }
  | { type: "none" };

export function resolveFleetImportKickAction(
  coverage: CoverageDay[],
): FleetImportKickAction {
  if (fleetKickShouldRun(coverage)) {
    return { type: "kick" };
  }
  if (fleetRetryPartialNeeded(coverage)) {
    return { type: "retry_partial" };
  }
  return { type: "none" };
}

export function isFleetRunActivelyProcessing(input: {
  status: string;
  heartbeatAt: string;
  staleThresholdMs?: number;
}): boolean {
  if (input.status !== "running") {
    return false;
  }
  const staleThresholdMs = input.staleThresholdMs ?? 15 * 60_000;
  const heartbeatAge = Date.now() - new Date(input.heartbeatAt).getTime();
  return heartbeatAge <= staleThresholdMs;
}

export function buildVehicleCoverageState(input: {
  date: string;
  today: string;
  hasTrip: boolean;
  hasIngestionRun: boolean;
  fleetRunIsFinal: boolean;
  fleetRunStatus: string | null;
  fleetHeartbeatAt: string | null;
  vehicleRunStatus: string | null;
}): { state: CoverageState; ready: boolean } {
  const isToday = input.date === input.today;
  const vehicleIngestComplete = input.vehicleRunStatus === "completed";
  const tripIsFinal =
    input.fleetRunIsFinal ||
    (!isToday && vehicleIngestComplete) ||
    (!input.hasIngestionRun && !isToday);
  const ready = input.hasTrip && (isToday || tripIsFinal);

  if (ready) {
    return {
      state: isToday && !input.fleetRunIsFinal ? "provisional" : "ready",
      ready: true,
    };
  }

  if (
    input.fleetRunStatus === "running" &&
    input.fleetHeartbeatAt &&
    isFleetRunActivelyProcessing({
      status: input.fleetRunStatus,
      heartbeatAt: input.fleetHeartbeatAt,
    })
  ) {
    return { state: "running", ready: false };
  }

  if (input.vehicleRunStatus === "running") {
    return { state: "running", ready: false };
  }

  if (input.vehicleRunStatus === "failed") {
    return { state: "failed", ready: false };
  }

  return { state: "missing", ready: false };
}
