import type { WialonStatRow, WialonTableRow } from "./types";

function isStatRow(value: unknown): value is WialonStatRow {
  return (
    typeof value === "object" &&
    value != null &&
    "n" in value &&
    typeof (value as WialonStatRow).n === "string"
  );
}

export function normalizeStatRows(stats: unknown): WialonStatRow[] {
  if (!Array.isArray(stats)) {
    return [];
  }

  const normalized: WialonStatRow[] = [];
  for (const entry of stats) {
    if (isStatRow(entry)) {
      normalized.push(entry);
      continue;
    }
    if (!Array.isArray(entry) || entry.length < 2) {
      continue;
    }
    const label = String(entry[0] ?? "").trim();
    if (!label) {
      continue;
    }
    const value = entry[1];
    normalized.push({
      n: label,
      c: Array.isArray(value) ? value : [value],
    });
  }
  return normalized;
}

export function normalizeSelectRowsResponse(response: unknown): WialonTableRow[] {
  if (Array.isArray(response)) {
    return response as WialonTableRow[];
  }
  if (
    typeof response === "object" &&
    response != null &&
    Array.isArray((response as { rows?: unknown }).rows)
  ) {
    return (response as { rows: WialonTableRow[] }).rows;
  }
  return [];
}
