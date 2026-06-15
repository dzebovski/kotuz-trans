export function parseFormattedNumber(input: string): number | null {
  const normalized = input
    .trim()
    .replace(/\s+/g, "")
    .replace(",", ".")
    .replace(/[^\d.+-]/g, "");
  if (!normalized) {
    return null;
  }
  const value = Number.parseFloat(normalized);
  return Number.isFinite(value) ? value : null;
}

export function parseValueWithUnit(
  input: string | { t?: string } | null | undefined,
): { value: number | null; unit: string | null; raw: string } {
  const raw =
    typeof input === "string"
      ? input
      : typeof input === "object" && input?.t
        ? input.t
        : "";
  const trimmed = raw.trim();
  if (!trimmed) {
    return { value: null, unit: null, raw };
  }

  const match = trimmed.match(/^([\d.,+-]+)\s*([^\d\s].*)?$/);
  if (!match) {
    return { value: parseFormattedNumber(trimmed), unit: null, raw };
  }

  const value = parseFormattedNumber(match[1]);
  const unit = match[2]?.trim() || null;
  return { value, unit, raw };
}

export function percentDifference(actual: number, expected: number): number {
  if (expected === 0) {
    return actual === 0 ? 0 : 100;
  }
  return ((actual - expected) / expected) * 100;
}

export function isWithinPercentTolerance(
  actual: number,
  expected: number,
  tolerancePercent: number,
): boolean {
  return Math.abs(percentDifference(actual, expected)) <= tolerancePercent;
}

export function sampleStdDev(values: number[]): number {
  if (values.length < 2) {
    return 0;
  }
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    (values.length - 1);
  return Math.sqrt(variance);
}

export function median(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}
