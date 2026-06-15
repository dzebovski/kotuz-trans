import { parseDurationToSeconds } from "@/utils/duration";
import { parseValueWithUnit } from "@/utils/numbers";
import {
  cellToString,
  parseCoordinateAddressCell,
  parseTimeCoordinateCell,
} from "./common";
import type { WialonTableRow } from "../types";

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
