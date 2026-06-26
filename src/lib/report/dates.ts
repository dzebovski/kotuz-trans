export const BUSINESS_TIMEZONE = "Europe/Kyiv";
export const POLL_INTERVAL_MS = 5_000;

export function getKyivDate(offsetDays = 0): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const date = new Date(
    Date.UTC(
      Number(values.year),
      Number(values.month) - 1,
      Number(values.day) + offsetDays,
    ),
  );
  return date.toISOString().slice(0, 10);
}

export function dateDaysAgo(days: number, end = getKyivDate(-1)): string {
  const date = new Date(`${end}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

export function inclusiveDateCount(from: string, to: string): number {
  const start = new Date(`${from}T00:00:00Z`).getTime();
  const end = new Date(`${to}T00:00:00Z`).getTime();
  return Math.max(0, Math.round((end - start) / 86_400_000) + 1);
}

export function isValidDateParam(value: string | null): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

export function resolveInitialRange(searchFrom: string | null, searchTo: string | null): {
  from: string;
  to: string;
} {
  const yesterday = getKyivDate(-1);
  if (isValidDateParam(searchFrom) && isValidDateParam(searchTo)) {
    return { from: searchFrom, to: searchTo };
  }
  return { from: yesterday, to: yesterday };
}
