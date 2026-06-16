import { DateTime } from "luxon";

export type BusinessDayInterval = {
  reportDate: string;
  intervalStart: Date;
  intervalEnd: Date;
  fromUnix: number;
  toUnix: number;
};

export function formatReportDate(date: DateTime): string {
  return date.toISODate() ?? date.toFormat("yyyy-MM-dd");
}

export function getBusinessDayInterval(
  reportDate: string,
  timezone: string,
): BusinessDayInterval {
  const day = DateTime.fromISO(reportDate, { zone: timezone });
  if (!day.isValid) {
    throw new Error(`Invalid report date: ${reportDate}`);
  }

  const start = day.startOf("day");
  const end = day.endOf("day");
  return {
    reportDate,
    intervalStart: start.toUTC().toJSDate(),
    intervalEnd: end.toUTC().toJSDate(),
    fromUnix: Math.floor(start.toSeconds()),
    toUnix: Math.floor(end.toSeconds()),
  };
}

export function getPreviousBusinessDay(
  timezone: string,
  reference = DateTime.now(),
): string {
  const local = reference.setZone(timezone);
  return formatReportDate(local.minus({ days: 1 }));
}

export function enumerateReportDates(from: string, to: string): string[] {
  const start = DateTime.fromISO(from, { zone: "utc" });
  const end = DateTime.fromISO(to, { zone: "utc" });
  if (!start.isValid) {
    throw new Error(`Invalid report date: ${from}`);
  }
  if (!end.isValid) {
    throw new Error(`Invalid report date: ${to}`);
  }
  if (start > end) {
    throw new Error(`Invalid date range: ${from} is after ${to}`);
  }

  const dates: string[] = [];
  let cursor = start;
  while (cursor <= end) {
    dates.push(formatReportDate(cursor));
    cursor = cursor.plus({ days: 1 });
  }
  return dates;
}

export function getRollingReportDateRange(
  days: number,
  timezone: string,
  reference = DateTime.now(),
): { from: string; to: string } {
  if (days < 1) {
    throw new Error(`Invalid days: ${days}`);
  }
  const to = getPreviousBusinessDay(timezone, reference);
  const toDate = DateTime.fromISO(to, { zone: timezone });
  const from = formatReportDate(toDate.minus({ days: days - 1 }));
  return { from, to };
}
