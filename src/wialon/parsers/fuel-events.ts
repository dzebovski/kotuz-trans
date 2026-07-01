import { parseValueWithUnit } from "@/utils/numbers";
import {
  parseFuelDailyStats,
  resolveFuelEventTableIndices,
  shouldLoadFuelChronology,
} from "./fuel-report";
import {
  cellToString,
  parseCoordinateAddressCell,
  parseGeoCell,
} from "./common";
import type { WialonStatRow, WialonStatCell, WialonTableRow } from "../types";

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

function structuredEventTypeForTable(tableName: string): FuelEventType | null {
  if (tableName === "unit_fillings") {
    return "refill";
  }
  if (tableName === "unit_drains" || tableName === "unit_thefts") {
    return "drain";
  }
  return null;
}

function locationAddressFromGeoCell(
  locationCell: ReturnType<typeof parseGeoCell>,
): string | null {
  return (
    locationCell.address ??
    (locationCell.raw && locationCell.raw.includes(",") ? locationCell.raw : null)
  );
}

function addressFromRowCells(cells: WialonStatCell[]): string | null {
  for (const cell of cells) {
    const coordinateCell = parseCoordinateAddressCell(cell);
    if (coordinateCell.address?.trim()) {
      return coordinateCell.address.trim();
    }
    const geoCell = parseGeoCell(cell);
    const fromGeo = locationAddressFromGeoCell(geoCell);
    if (fromGeo?.trim()) {
      return fromGeo.trim();
    }
  }
  return null;
}

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
  return isStructuredFuelVolumeRow(cells);
}

function isStructuredFuelVolumeRow(cells: WialonStatCell[]): boolean {
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

function extractVolumeFromText(source: string): number | null {
  const match = source.match(/([\d.,]+)\s*(?:l|л)/i);
  if (!match) {
    return null;
  }
  const value = parseValueWithUnit(match[0]).value;
  if (value != null && value > 0) {
    return value;
  }
  return null;
}

function extractVolume(description: string, notes: string): number | null {
  return extractVolumeFromText(description) ?? extractVolumeFromText(notes);
}

function isIntervalDrainRow(cells: WialonStatCell[]): boolean {
  if (cells.length < 4 || isStructuredFuelVolumeRow(cells)) {
    return false;
  }
  const sequenceCell = cellToString(cells[0] ?? null).trim();
  if (detectEventType(sequenceCell) != null || !/^\d+$/.test(sequenceCell)) {
    return false;
  }
  const start = parseGeoCell(cells[1] ?? null);
  return start.time != null;
}

function resolveIntervalDrainAddress(
  cells: WialonStatCell[],
  position: ReturnType<typeof parseGeoCell>,
  start: ReturnType<typeof parseGeoCell>,
  end: ReturnType<typeof parseGeoCell>,
): string | null {
  return (
    addressFromRowCells([cells[3] ?? null, cells[4] ?? null, cells[5] ?? null]) ??
    locationAddressFromGeoCell(position) ??
    locationAddressFromGeoCell(start) ??
    locationAddressFromGeoCell(end) ??
    addressFromRowCells(cells.slice(1)) ??
    null
  );
}

function collectLiterVolumesFromIndex(
  cells: WialonStatCell[],
  startIndex: number,
): number[] {
  const volumes: number[] = [];
  for (let index = startIndex; index < cells.length; index += 1) {
    const cell = cells[index] ?? null;
    const parsed = parseValueWithUnit(cell);
    if (
      parsed.value != null &&
      parsed.value > 0 &&
      parsed.unit != null &&
      /^l$/i.test(parsed.unit)
    ) {
      volumes.push(parsed.value);
      continue;
    }
    const fromText = extractVolumeFromText(cellToString(cell));
    if (fromText != null) {
      volumes.push(fromText);
    }
  }
  return volumes;
}

function resolveIntervalDrainVolume(cells: WialonStatCell[]): number | null {
  const literVolumes = collectLiterVolumesFromIndex(cells, 4);

  if (literVolumes.length === 1) {
    return literVolumes[0] ?? null;
  }
  if (literVolumes.length === 2) {
    const [fuelBeforeL, fuelAfterL] = literVolumes;
    if (fuelBeforeL > fuelAfterL) {
      return fuelBeforeL - fuelAfterL;
    }
    return null;
  }
  if (literVolumes.length >= 3) {
    return literVolumes[literVolumes.length - 1] ?? null;
  }

  return null;
}

function parseIntervalDrainRow(row: WialonTableRow): ParsedFuelEvent | null {
  const cells = row.c ?? [];
  if (!isIntervalDrainRow(cells)) {
    return null;
  }

  const start = parseGeoCell(cells[1] ?? null);
  const end = parseGeoCell(cells[2] ?? null);
  const position = parseGeoCell(cells[3] ?? null);
  const volumeL = resolveIntervalDrainVolume(cells);

  if (!start.time || volumeL == null || volumeL <= 0) {
    return null;
  }

  const address = resolveIntervalDrainAddress(cells, position, start, end);
  const latitude = position.latitude ?? start.latitude ?? end.latitude;
  const longitude = position.longitude ?? start.longitude ?? end.longitude;

  return {
    eventType: "drain",
    eventTime: start.time,
    volumeL,
    latitude,
    longitude,
    address,
    sourceRowNumber: row.n ?? 0,
    rawEvent: {
      format: "unit_drains_interval",
      sequence: cellToString(cells[0] ?? null),
      endedAt: end.time,
    },
  };
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
  const address = locationAddressFromGeoCell(locationCell);

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

function parseStructuredDrainRow(row: WialonTableRow): ParsedFuelEvent | null {
  const cells = row.c ?? [];
  if (!isStructuredFuelVolumeRow(cells)) {
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
    locationAddressFromGeoCell(locationCell) ?? addressFromRowCells(cells.slice(3));

  return {
    eventType: "drain",
    eventTime: timeCell.time,
    volumeL,
    latitude,
    longitude,
    address,
    sourceRowNumber: row.n ?? 0,
    rawEvent: {
      format: "unit_drains",
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
  const end = parseCoordinateAddressCell(cells[2] ?? null);
  const startPosition = parseCoordinateAddressCell(cells[4] ?? null);
  const endPosition = parseCoordinateAddressCell(cells[5] ?? null);
  const description = cellToString(cells[6] ?? null);
  const notes = cellToString(cells[7] ?? null);
  const volumeL = extractVolume(description, notes);
  if (!start.time || volumeL == null) {
    return null;
  }

  const addressCandidates =
    eventType === "drain"
      ? [
          startPosition.address,
          endPosition.address,
          start.address,
          end.address,
        ]
      : [
          startPosition.address,
          start.address,
          endPosition.address,
          end.address,
        ];
  const address =
    addressCandidates.find((candidate) => candidate?.trim()) ?? null;

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
  tableName?: string,
): { events: ParsedFuelEvent[]; warnings: string[] } {
  const events: ParsedFuelEvent[] = [];
  const warnings: string[] = [];
  const structuredType = tableName ? structuredEventTypeForTable(tableName) : null;

  for (const row of rows) {
    const typeCell = cellToString(row.c?.[0] ?? null);
    if (shouldSkipChronologyRow(typeCell)) {
      continue;
    }

    if (structuredType === "drain") {
      const structured = parseStructuredDrainRow(row);
      if (structured) {
        events.push(structured);
        continue;
      }
      const interval = parseIntervalDrainRow(row);
      if (interval) {
        events.push(interval);
        continue;
      }
      const chronology = parseChronologyFuelEventRow(row);
      if (chronology) {
        events.push(chronology);
        continue;
      }
      warnings.push(`Unparsed drain row ${row.n ?? "?"}`);
      continue;
    } else if (structuredType === "refill") {
      const structured = parseStructuredFillingRow(row);
      if (structured) {
        events.push(structured);
        continue;
      }
    } else if (!tableName || tableName === "unit_chronology") {
      if (!structuredType) {
        const structuredRefill = parseStructuredFillingRow(row);
        if (structuredRefill) {
          events.push(structuredRefill);
          continue;
        }
      }

      const chronology = parseChronologyFuelEventRow(row);
      if (chronology) {
        events.push(chronology);
        continue;
      }
    }

    if (typeCell && !/^\d+$/.test(typeCell.trim())) {
      warnings.push(`Unknown fuel event type in row ${row.n ?? "?"}`);
    }
  }

  return { events, warnings };
}

export function parseFuelEventsFromReport(input: {
  stats: WialonStatRow[];
  rows: WialonTableRow[];
  tables: Array<{ name?: string; rows?: number }>;
}): { events: ParsedFuelEvent[]; warnings: string[] } {
  if (!shouldLoadFuelChronology(parseFuelDailyStats(input.stats))) {
    return { events: [], warnings: [] };
  }

  const tableIndices = resolveFuelEventTableIndices({
    stats: input.stats,
    tables: input.tables,
  });
  const events: ParsedFuelEvent[] = [];
  const warnings: string[] = [];
  let offset = 0;

  for (const tableIndex of tableIndices) {
    const rowCount = input.tables[tableIndex]?.rows ?? 0;
    const tableRows = input.rows.slice(offset, offset + rowCount);
    offset += rowCount;
    const tableName = input.tables[tableIndex]?.name ?? "";
    const parsed = parseFuelEvents(tableRows, tableName);
    events.push(...parsed.events);
    warnings.push(...parsed.warnings);
  }

  return { events, warnings };
}
