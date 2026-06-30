import { describe, expect, it } from "vitest";
import { resolveImportButtonState } from "@/lib/report/import-button-state";
import type { CoverageDay } from "@/lib/report/types";

function day(
  partial: Partial<CoverageDay> & Pick<CoverageDay, "date" | "state">,
): CoverageDay {
  return {
    ready: partial.state === "ready",
    isToday: false,
    successfulVehicles: 0,
    failedVehicles: 0,
    expectedVehicles: 0,
    queueAttempts: 0,
    queueStatus: null,
    queueRunAfter: null,
    lastError: null,
    updatedAt: null,
    ...partial,
  };
}

describe("resolveImportButtonState", () => {
  it("shows spinner only while processing", () => {
    const state = resolveImportButtonState({
      coverage: [day({ date: "2026-06-29", state: "queued", queueStatus: "pending" })],
      mutating: true,
    });

    expect(state.showSpinner).toBe(true);
  });

  it("does not show spinner for queued dates without active processing", () => {
    const state = resolveImportButtonState({
      coverage: [
        day({
          date: "2026-06-29",
          state: "queued",
          queueStatus: "pending",
          queueRunAfter: "2026-06-30T08:00:00.000Z",
        }),
      ],
      mutating: false,
    });

    expect(state.showSpinner).toBe(false);
    expect(state.primaryAction).toBe("import");
  });

  it("offers retry now during backoff", () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    const state = resolveImportButtonState({
      coverage: [
        day({
          date: "2026-06-29",
          state: "queued",
          queueStatus: "pending",
          queueRunAfter: future,
        }),
      ],
      mutating: false,
    });

    expect(state.showSpinner).toBe(false);
    expect(state.primaryAction).toBe("retryNow");
    expect(state.primaryLabel).toBe("Спробувати зараз");
  });

  it("offers restart when stuck", () => {
    const state = resolveImportButtonState({
      coverage: [
        day({
          date: "2026-06-29",
          state: "queued",
          queueStatus: "pending",
          queueRunAfter: new Date(Date.now() - 1_000).toISOString(),
        }),
      ],
      mutating: false,
      stuck: true,
    });

    expect(state.showSpinner).toBe(false);
    expect(state.primaryAction).toBe("restart");
    expect(state.primaryLabel).toBe("Перезапустити дату");
  });
});
