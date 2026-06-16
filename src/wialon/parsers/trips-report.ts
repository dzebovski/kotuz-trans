import { parseDurationToSeconds } from "@/utils/duration";
import { parseValueWithUnit } from "@/utils/numbers";
import {
  cellToString,
  parseCoordinateAddressCell,
  parseTimeCoordinateCell,
} from "./common";
import type { WialonStatRow, WialonTableRow } from "../types";

const TRIPS_STAT_LABELS = {
  movementDuration: "Время в движении",
  stopCount: "Количество остановок",
  parkingDuration: "Продолжительность стоянок",
  parkingCountFromTrips: "Количество стоянок",
  mileageKm: "Пробег в поездках",
  averageSpeedKmh: "Средняя скорость в поездках",
  maxSpeedKmh: "Макс. скорость в поездках",
  fuelConsumedL: "Потрачено по ДУТ в поездках",
  averageFuelConsumptionLPer100Km: "Ср. расход по ДУТ в поездках",
} as const;

const TRIPS_DURATION_LABELS = new Set<string>([
  TRIPS_STAT_LABELS.movementDuration,
  TRIPS_STAT_LABELS.parkingDuration,
]);

export type ParsedTripsDailyStats = {
  movementDurationSeconds: number | null;
  stopCount: number;
  parkingDurationSeconds: number | null;
  parkingCountFromTrips: number;
  mileageKm: number | null;
  averageSpeedKmh: number | null;
  maxSpeedKmh: number | null;
  fuelConsumedL: number | null;
  averageFuelConsumptionLPer100Km: number | null;
  rawReportStats: Array<{ label: string; raw: string; unit: string | null }>;
  warnings: string[];
};

function pickCount(values: Record<string, number | null>, label: string): number {
  const value = values[label];
  return value == null ? 0 : Math.round(value);
}

function parseTripsStatValues(stats: WialonStatRow[]): {
  values: Record<string, number | null>;
  raw: Array<{ label: string; raw: string; unit: string | null }>;
  warnings: string[];
} {
  const values: Record<string, number | null> = {};
  const raw: Array<{ label: string; raw: string; unit: string | null }> = [];
  const warnings: string[] = [];

  for (const row of stats) {
    const label = row.n?.trim();
    if (!label) {
      continue;
    }
    const cell = row.c?.[0] ?? null;
    const rawText = cellToString(cell);

    if (TRIPS_DURATION_LABELS.has(label)) {
      const seconds = parseDurationToSeconds(rawText);
      raw.push({ label, raw: rawText, unit: "s" });
      values[label] = seconds;
      if (seconds == null && rawText) {
        warnings.push(`Unable to parse duration stat label "${label}"`);
      }
      continue;
    }

    const parsed = parseValueWithUnit(cell);
    raw.push({ label, raw: parsed.raw, unit: parsed.unit });
    values[label] = parsed.value;
    if (parsed.value == null && parsed.raw) {
      warnings.push(`Unable to parse stat label "${label}"`);
    }
  }

  return { values, raw, warnings };
}

export function parseTripsDailyStats(stats: WialonStatRow[]): ParsedTripsDailyStats {
  const { values, raw, warnings } = parseTripsStatValues(stats);

  return {
    movementDurationSeconds: values[TRIPS_STAT_LABELS.movementDuration] ?? null,
    stopCount: pickCount(values, TRIPS_STAT_LABELS.stopCount),
    parkingDurationSeconds: values[TRIPS_STAT_LABELS.parkingDuration] ?? null,
    parkingCountFromTrips: pickCount(values, TRIPS_STAT_LABELS.parkingCountFromTrips),
    mileageKm: values[TRIPS_STAT_LABELS.mileageKm] ?? null,
    averageSpeedKmh: values[TRIPS_STAT_LABELS.averageSpeedKmh] ?? null,
    maxSpeedKmh: values[TRIPS_STAT_LABELS.maxSpeedKmh] ?? null,
    fuelConsumedL: values[TRIPS_STAT_LABELS.fuelConsumedL] ?? null,
    averageFuelConsumptionLPer100Km:
      values[TRIPS_STAT_LABELS.averageFuelConsumptionLPer100Km] ?? null,
    rawReportStats: raw,
    warnings,
  };
}

export type TripsReportParseResult = {
  daily: ParsedTripsDailyStats;
  segments: ParsedTripSegment[];
};

export function parseTripsReportFull(input: {
  stats: WialonStatRow[];
  rows: WialonTableRow[];
}): TripsReportParseResult {
  return {
    daily: parseTripsDailyStats(input.stats),
    segments: parseTripsReport(input.rows),
  };
}

export type ParsedTripSegment = {
  sourceRowNumber: number;
  startedAt: string | null;
  endedAt: string | null;
  durationSeconds: number | null;
  mileageKm: number | null;
  urbanMileageKm: number | null;
  highwayMileageKm: number | null;
  averageFuelConsumptionLPer100Km: number | null;
  fuelConsumedL: number | null;
  averageSpeedKmh: number | null;
  maxSpeedKmh: number | null;
  startingFuelL: number | null;
  endingFuelL: number | null;
  startLatitude: number | null;
  startLongitude: number | null;
  startCountry: string | null;
  startCity: string | null;
  startAddress: string | null;
  endLatitude: number | null;
  endLongitude: number | null;
  endCountry: string | null;
  endCity: string | null;
  endAddress: string | null;
  rawRow: Record<string, unknown>;
};

export function parseTripSegmentRow(
  row: WialonTableRow,
  sourceRowNumber: number,
): ParsedTripSegment {
  const cells = row.c ?? [];
  const startTime = parseTimeCoordinateCell(cells[0] ?? null);
  const startAddress = parseCoordinateAddressCell(cells[1] ?? null);
  const endTime = parseTimeCoordinateCell(cells[2] ?? null);
  const endAddress = parseCoordinateAddressCell(cells[3] ?? null);
  const durationSeconds = parseDurationToSeconds(cellToString(cells[4] ?? null));
  const mileageKm = parseValueWithUnit(cells[6] ?? null).value;
  const averageFuelConsumptionLPer100Km = parseValueWithUnit(cells[7] ?? null).value;
  const urbanMileageKm = parseValueWithUnit(cells[8] ?? null).value;
  const highwayMileageKm = parseValueWithUnit(cells[9] ?? null).value;
  const averageSpeedKmh = parseValueWithUnit(cells[12] ?? null).value;
  const maxSpeedKmh = parseValueWithUnit(cells[13] ?? null).value;
  const fuelConsumedL = parseValueWithUnit(cells[14] ?? null).value;
  const startingFuelL = parseValueWithUnit(cells[15] ?? null).value;
  const endingFuelL = parseValueWithUnit(cells[16] ?? null).value;

  return {
    sourceRowNumber,
    startedAt: startTime.time,
    endedAt: endTime.time,
    durationSeconds,
    mileageKm,
    urbanMileageKm,
    highwayMileageKm,
    averageFuelConsumptionLPer100Km,
    fuelConsumedL,
    averageSpeedKmh,
    maxSpeedKmh,
    startingFuelL,
    endingFuelL,
    startLatitude: startAddress.latitude ?? startTime.latitude,
    startLongitude: startAddress.longitude ?? startTime.longitude,
    startCountry: startAddress.country,
    startCity: startAddress.city,
    startAddress: startAddress.address,
    endLatitude: endAddress.latitude ?? endTime.latitude,
    endLongitude: endAddress.longitude ?? endTime.longitude,
    endCountry: endAddress.country,
    endCity: endAddress.city,
    endAddress: endAddress.address,
    rawRow: {
      n: row.n,
      c: cells.map((cell) => cellToString(cell)),
    },
  };
}

export function parseTripsReport(rows: WialonTableRow[]): ParsedTripSegment[] {
  return rows.map((row, index) => parseTripSegmentRow(row, row.n ?? index));
}
