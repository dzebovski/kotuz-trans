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
