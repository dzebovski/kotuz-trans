export function nullableNumber(value: number | null | undefined): number | undefined {
  return value == null || Number.isNaN(value) ? undefined : value;
}

export function nullableTimestamp(value: string | null | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? undefined : timestamp;
}
