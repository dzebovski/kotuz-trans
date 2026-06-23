import { DateTime } from "luxon";
import { enumerateReportDates } from "./time";

export const MAX_REPORT_RANGE_DAYS = 90;

export function validateReportRange(input: {
  from: string;
  to: string;
  timezone: string;
}):
  | { ok: true; from: string; to: string; dates: string[]; today: string }
  | { ok: false; error: string } {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(input.from) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(input.to)
  ) {
    return { ok: false, error: "Dates must use YYYY-MM-DD format" };
  }

  const fromDate = DateTime.fromISO(input.from, { zone: input.timezone });
  const toDate = DateTime.fromISO(input.to, { zone: input.timezone });
  if (
    !fromDate.isValid ||
    !toDate.isValid ||
    fromDate.toISODate() !== input.from ||
    toDate.toISODate() !== input.to
  ) {
    return { ok: false, error: "Invalid report range" };
  }
  if (fromDate > toDate) {
    return { ok: false, error: "Range start must not be after range end" };
  }

  const today = DateTime.now().setZone(input.timezone).toISODate()!;
  if (input.to > today) {
    return { ok: false, error: "Future report dates are not allowed" };
  }

  const dates = enumerateReportDates(input.from, input.to);
  if (dates.length > MAX_REPORT_RANGE_DAYS) {
    return {
      ok: false,
      error: `Date range cannot exceed ${MAX_REPORT_RANGE_DAYS} days`,
    };
  }
  return { ok: true, from: input.from, to: input.to, dates, today };
}

