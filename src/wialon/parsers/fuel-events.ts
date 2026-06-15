import { parseValueWithUnit } from "@/utils/numbers";
import { cellToString, parseCoordinateAddressCell } from "./common";
import type { WialonTableRow } from "../types";

export type FuelEventType = "refill" | "drain";

export type ParsedFuelEvent = {
  eventType: FuelEventType;
  eventTime: string;
  volumeL: number;
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  sourceRowNumber: number;
  rawEvent: Record<string, unknown>;
};

const REFILL_PATTERNS = [
  /заправ/i,
  /refill/i,
  /filling/i,
  /fill/i,
];
const DRAIN_PATTERNS = [
  /слив/i,
  /drain/i,
  /theft/i,
];

function detectEventType(typeCell: string): FuelEventType | null {
  if (REFILL_PATTERNS.some((pattern) => pattern.test(typeCell))) {
    return "refill";
  }
  if (DRAIN_PATTERNS.some((pattern) => pattern.test(typeCell))) {
    return "drain";
  }
  return null;
}

function extractVolume(description: string, notes: string): number | null {
  const sources = [description, notes];
  for (const source of sources) {
    const match = source.match(/([\d.,]+)\s*l\b/i);
    if (match) {
      const value = parseValueWithUnit(match[0]).value;
      if (value != null && value > 0) {
        return value;
      }
    }
  }
  return null;
}

export function parseFuelEvents(
  rows: WialonTableRow[],
): { events: ParsedFuelEvent[]; warnings: string[] } {
  const events: ParsedFuelEvent[] = [];
  const warnings: string[] = [];

  for (const row of rows) {
    const cells = row.c ?? [];
    const typeCell = cellToString(cells[0] ?? null);
    const eventType = detectEventType(typeCell);
    if (!eventType) {
      warnings.push(`Unknown fuel event type in row ${row.n ?? "?"}`);
      continue;
    }

    const start = parseCoordinateAddressCell(cells[1] ?? null);
    const description = cellToString(cells[6] ?? null);
    const notes = cellToString(cells[7] ?? null);
    const volumeL = extractVolume(description, notes);
    if (!start.time || volumeL == null) {
      warnings.push(
        `Skipped fuel event row ${row.n ?? "?"}: missing time or volume`,
      );
      continue;
    }

    events.push({
      eventType,
      eventTime: start.time,
      volumeL,
      latitude: start.latitude,
      longitude: start.longitude,
      address: start.address,
      sourceRowNumber: row.n ?? events.length,
      rawEvent: {
        type: typeCell,
        description,
        notes,
      },
    });
  }

  return { events, warnings };
}
