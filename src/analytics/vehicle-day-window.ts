import { DateTime } from "luxon";
import type { ParsedTripSegment } from "@/wialon/parsers/trips-report";

type SegmentWithManeuver = ParsedTripSegment & { isLocalManeuver: boolean };

export type VehicleDayTripWindow = {
  firstTripAt: string | null;
  lastTripAt: string | null;
};

function parseWialonTime(
  value: string | null,
  timezone: string,
): DateTime | null {
  if (!value) {
    return null;
  }
  const parsed = DateTime.fromFormat(value, "yyyy-MM-dd HH:mm:ss", {
    zone: timezone,
  });
  if (parsed.isValid) {
    return parsed;
  }
  const iso = DateTime.fromISO(value, { zone: timezone });
  if (iso.isValid) {
    return iso;
  }
  return null;
}

export function getVehicleDayTripWindow(
  segments: SegmentWithManeuver[],
  timezone: string,
): VehicleDayTripWindow {
  const routeSegments = segments.filter((segment) => !segment.isLocalManeuver);
  const used = routeSegments.length > 0 ? routeSegments : segments;

  let first: DateTime | null = null;
  let last: DateTime | null = null;

  for (const segment of used) {
    const start = parseWialonTime(segment.startedAt, timezone);
    const end = parseWialonTime(segment.endedAt, timezone);
    if (start?.isValid && (!first || start < first)) {
      first = start;
    }
    if (end?.isValid && (!last || end > last)) {
      last = end;
    }
  }

  return {
    firstTripAt: first?.toUTC().toISO() ?? null,
    lastTripAt: last?.toUTC().toISO() ?? null,
  };
}

export function formatTimeRange(
  firstTripAt: string | null,
  lastTripAt: string | null,
  timezone: string,
): string | null {
  if (!firstTripAt && !lastTripAt) {
    return null;
  }
  const format = (iso: string) =>
    DateTime.fromISO(iso, { zone: timezone }).toFormat("HH:mm");
  if (firstTripAt && lastTripAt) {
    return `${format(firstTripAt)} — ${format(lastTripAt)}`;
  }
  if (firstTripAt) {
    return format(firstTripAt);
  }
  return format(lastTripAt!);
}
