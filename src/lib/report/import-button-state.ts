import { isQueueItemClaimable } from "@/lib/report/coverage";
import type { CoverageDay } from "@/lib/report/types";

export type ImportButtonAction =
  | "import"
  | "retry"
  | "retryNow"
  | "restart";

export type ImportButtonState = {
  showSpinner: boolean;
  primaryLabel: string;
  primaryAction: ImportButtonAction;
  stuck: boolean;
  waitingBackoff: boolean;
};

export function resolveImportButtonState(input: {
  coverage: CoverageDay[];
  mutating: boolean;
  stuck?: boolean;
}): ImportButtonState {
  const { coverage, mutating, stuck = false } = input;
  const running = coverage.filter((day) => day.state === "running").length;
  const processing = mutating || running > 0;
  const problemDays = coverage.filter(
    (day) => day.state === "failed" || day.state === "partial",
  );
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
  const missing = coverage.filter((day) => day.state === "missing").length;

  if (processing) {
    if (problemDays.length > 0) {
      return {
        showSpinner: true,
        primaryLabel: retryExhausted
          ? "Спробувати проблемні машини"
          : "Довантажити дані",
        primaryAction: "retry",
        stuck: false,
        waitingBackoff,
      };
    }
    return {
      showSpinner: true,
      primaryLabel:
        missing > 0 ? "Завантажити дані для звіту" : "Довантажити пропущені",
      primaryAction: "import",
      stuck: false,
      waitingBackoff,
    };
  }

  if (stuck) {
    return {
      showSpinner: false,
      primaryLabel: "Перезапустити дату",
      primaryAction: "restart",
      stuck: true,
      waitingBackoff,
    };
  }

  if (waitingBackoff) {
    return {
      showSpinner: false,
      primaryLabel: "Спробувати зараз",
      primaryAction: "retryNow",
      stuck: false,
      waitingBackoff: true,
    };
  }

  if (problemDays.length > 0) {
    return {
      showSpinner: false,
      primaryLabel: retryExhausted
        ? "Спробувати проблемні машини"
        : "Довантажити дані",
      primaryAction: "retry",
      stuck: false,
      waitingBackoff,
    };
  }

  return {
    showSpinner: false,
    primaryLabel:
      missing > 0 ? "Завантажити дані для звіту" : "Довантажити пропущені",
    primaryAction: "import",
    stuck: false,
    waitingBackoff,
  };
}
