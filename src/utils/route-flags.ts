import { normalizeCountryCode } from "@/analytics/country-normalizer";

const FLAG_BASE = 0x1f1e6;

export type RouteDay = {
  reportDate: string;
  mileageKm: number;
  routeKey: string | null;
};

export function countryCodeToFlag(code: string | null | undefined): string | null {
  const normalized = normalizeCountryCode(code);
  if (!normalized || normalized.length !== 2) {
    return null;
  }
  const upper = normalized.toUpperCase();
  const first = upper.codePointAt(0);
  const second = upper.codePointAt(1);
  if (
    first == null ||
    second == null ||
    first < 65 ||
    first > 90 ||
    second < 65 ||
    second > 90
  ) {
    return null;
  }
  return String.fromCodePoint(
    FLAG_BASE + first - 65,
    FLAG_BASE + second - 65,
  );
}

export function parseRouteKeyCountries(
  routeKey: string | null | undefined,
): { start: string; end: string } | null {
  if (!routeKey) {
    return null;
  }
  const parts = routeKey.split(">");
  if (parts.length < 2) {
    return null;
  }
  const start = parts[0]?.split(":")[0]?.trim() ?? null;
  const end = parts[parts.length - 1]?.split(":")[0]?.trim() ?? null;
  if (!start || !end) {
    return null;
  }
  const startCode = normalizeCountryCode(start);
  const endCode = normalizeCountryCode(end);
  if (!startCode || !endCode) {
    return null;
  }
  return { start: startCode, end: endCode };
}

export function buildPeriodRouteCountries(days: RouteDay[]): string[] {
  const sorted = [...days].sort((a, b) =>
    a.reportDate.localeCompare(b.reportDate),
  );
  const sequence: string[] = [];

  for (const day of sorted) {
    const countries = parseRouteKeyCountries(day.routeKey);
    if (!countries) {
      continue;
    }
    const { start, end } = countries;
    if (sequence.length === 0) {
      sequence.push(start);
    } else if (sequence[sequence.length - 1] !== start) {
      sequence.push(start);
    }
    if (end !== sequence[sequence.length - 1]) {
      sequence.push(end);
    }
  }

  return sequence;
}

export function formatRouteFlags(days: RouteDay[]): string {
  const totalMileage = days.reduce((sum, day) => sum + day.mileageKm, 0);
  if (totalMileage <= 0) {
    return "—";
  }
  const countries = buildPeriodRouteCountries(days);
  if (countries.length === 0) {
    return "—";
  }
  const displayCountries =
    countries.length > 2
      ? [countries[0], countries[countries.length - 1]]
      : countries;
  const flags = displayCountries
    .map((code) => countryCodeToFlag(code))
    .filter((flag): flag is string => Boolean(flag));
  if (flags.length === 0) {
    return "—";
  }
  return flags.join(" → ");
}
