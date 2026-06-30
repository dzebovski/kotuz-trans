import { parseValueWithUnit } from "@/utils/numbers";
import {
  cellToString,
  parseCoordinateAddressCell,
  parseGeoCell,
} from "./common";
import type { WialonStatCell, WialonTableRow } from "../types";

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
const SKIP_CHRONOLOGY_TYPES = [/^trip$/i, /^стоян/i, /^parking$/i];

function detectEventType(typeCell: string): FuelEventType | null {
  if (REFILL_PATTERNS.some((pattern) => pattern.test(typeCell))) {
    return "refill";
  }
  if (DRAIN_PATTERNS.some((pattern) => pattern.test(typeCell))) {
    return "drain";
  }
  return null;
}

function shouldSkipChronologyRow(typeCell: string): boolean {
  return SKIP_CHRONOLOGY_TYPES.some((pattern) => pattern.test(typeCell.trim()));
}

function hasLiterUnit(cell: WialonStatCell): boolean {
  const { unit } = parseValueWithUnit(cell);
  return unit != null && /^l$/i.test(unit);
}

function isStructuredFillingRow(cells: WialonStatCell[]): boolean {
  if (cells.length < 6) {
    return false;
  }
  if (!hasLiterUnit(cells[3] ?? null)) {
    return false;
  }
  if (!hasLiterUnit(cells[4] ?? null)) {
    return false;
  }
  if (!hasLiterUnit(cells[5] ?? null)) {
    return false;
  }
  const volumeL = parseValueWithUnit(cells[5] ?? null).value;
  const fuelBeforeL = parseValueWithUnit(cells[3] ?? null).value;
  const fuelAfterL = parseValueWithUnit(cells[4] ?? null).value;
  if (volumeL == null || volumeL <= 0) {
    return false;
  }
  return fuelBeforeL != null && fuelAfterL != null;
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

function parseStructuredFillingRow(row: WialonTableRow): ParsedFuelEvent | null {
  const cells = row.c ?? [];
  if (!isStructuredFillingRow(cells)) {
    return null;
  }

  const timeCell = parseGeoCell(cells[1] ?? null);
  const locationCell = parseGeoCell(cells[2] ?? null);
  const fuelBeforeL = parseValueWithUnit(cells[3] ?? null).value;
  const fuelAfterL = parseValueWithUnit(cells[4] ?? null).value;
  const volumeL = parseValueWithUnit(cells[5] ?? null).value;

  if (!timeCell.time || volumeL == null || volumeL <= 0) {
    return null;
  }

  const latitude = timeCell.latitude ?? locationCell.latitude;
  const longitude = timeCell.longitude ?? locationCell.longitude;
  const address =
    locationCell.address ??
    (locationCell.raw && locationCell.raw.includes(",") ? locationCell.raw : null);

  return {
    eventType: "refill",
    eventTime: timeCell.time,
    volumeL,
    latitude,
    longitude,
    address,
    sourceRowNumber: row.n ?? 0,
    rawEvent: {
      format: "unit_fillings",
      sequence: cellToString(cells[0] ?? null),
      fuelBeforeL,
      fuelAfterL,
    },
  };
}

function parseChronologyFuelEventRow(row: WialonTableRow): ParsedFuelEvent | null {
  const cells = row.c ?? [];
  const typeCell = cellToString(cells[0] ?? null);
  if (shouldSkipChronologyRow(typeCell)) {
    return null;
  }

  const eventType = detectEventType(typeCell);
  if (!eventType) {
    return null;
  }

  const start = parseCoordinateAddressCell(cells[1] ?? null);
  const startPosition = parseCoordinateAddressCell(cells[4] ?? null);
  const endPosition = parseCoordinateAddressCell(cells[5] ?? null);
  const description = cellToString(cells[6] ?? null);
  const notes = cellToString(cells[7] ?? null);
  const volumeL = extractVolume(description, notes);
  if (!start.time || volumeL == null) {
    return null;
  }

  const address =
    startPosition.address ??
    (eventType === "drain" ? endPosition.address : null) ??
    start.address;

  return {
    eventType,
    eventTime: start.time,
    volumeL,
    latitude: start.latitude ?? startPosition.latitude ?? endPosition.latitude,
    longitude: start.longitude ?? startPosition.longitude ?? endPosition.longitude,
    address,
    sourceRowNumber: row.n ?? 0,
    rawEvent: {
      format: "unit_chronology",
      type: typeCell,
      description,
      notes,
    },
  };
}

export function parseFuelEvents(
  rows: WialonTableRow[],
): { events: ParsedFuelEvent[]; warnings: string[] } {
  const events: ParsedFuelEvent[] = [];
  const warnings: string[] = [];

  for (const row of rows) {
    const typeCell = cellToString(row.c?.[0] ?? null);
    if (shouldSkipChronologyRow(typeCell)) {
      continue;
    }

    const structured = parseStructuredFillingRow(row);
    if (structured) {
      events.push(structured);
      continue;
    }

    const chronology = parseChronologyFuelEventRow(row);
    if (chronology) {
      events.push(chronology);
      continue;
    }

    if (typeCell && !/^\d+$/.test(typeCell.trim())) {
      warnings.push(`Unknown fuel event type in row ${row.n ?? "?"}`);
    }
  }

  return { events, warnings };
}
