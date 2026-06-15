import { parseLabeledStats } from "./common";
import type { WialonStatRow, WialonTableRow } from "../types";

const FUEL_STAT_LABELS = {
  mileageKm: "Пробег в поездках",
  urbanMileageKm: "Городской пробег в поездках",
  highwayMileageKm: "Загородный пробег в поездках",
  maxSpeedKmh: "Макс. скорость в поездках",
  averageSpeedKmh: "Средняя скорость в поездках",
  startingFuelL: "Нач. уровень",
  endingFuelL: "Конеч. уровень",
  refillCount: "Всего заправок",
  refilledL: "Всего заправлено",
  drainCount: "Всего сливов",
  drainedL: "Всего топлива слито",
  fuelConsumedL: "Потрачено по ДУТ",
  averageFuelConsumption: "Ср. расход по ДУТ (пробег по детектору поездок)",
  parkingCount: "Количество стоянок",
} as const;

export type ParsedFuelDailyStats = {
  mileageKm: number | null;
  urbanMileageKm: number | null;
  highwayMileageKm: number | null;
  maxSpeedKmh: number | null;
  averageSpeedKmh: number | null;
  startingFuelL: number | null;
  endingFuelL: number | null;
  refillCount: number;
  refilledL: number;
  drainCount: number;
  drainedL: number;
  fuelConsumedL: number | null;
  averageFuelConsumptionLPer100Km: number | null;
  parkingCount: number;
  rawReportStats: Array<{ label: string; raw: string; unit: string | null }>;
  warnings: string[];
};

function pickValue(
  values: Record<string, number | null>,
  label: string,
): number | null {
  return values[label] ?? null;
}

function pickCount(values: Record<string, number | null>, label: string): number {
  const value = values[label];
  return value == null ? 0 : Math.round(value);
}

export function parseFuelDailyStats(stats: WialonStatRow[]): ParsedFuelDailyStats {
  const { values, raw, warnings } = parseLabeledStats(stats);

  return {
    mileageKm: pickValue(values, FUEL_STAT_LABELS.mileageKm),
    urbanMileageKm: pickValue(values, FUEL_STAT_LABELS.urbanMileageKm),
    highwayMileageKm: pickValue(values, FUEL_STAT_LABELS.highwayMileageKm),
    maxSpeedKmh: pickValue(values, FUEL_STAT_LABELS.maxSpeedKmh),
    averageSpeedKmh: pickValue(values, FUEL_STAT_LABELS.averageSpeedKmh),
    startingFuelL: pickValue(values, FUEL_STAT_LABELS.startingFuelL),
    endingFuelL: pickValue(values, FUEL_STAT_LABELS.endingFuelL),
    refillCount: pickCount(values, FUEL_STAT_LABELS.refillCount),
    refilledL: pickValue(values, FUEL_STAT_LABELS.refilledL) ?? 0,
    drainCount: pickCount(values, FUEL_STAT_LABELS.drainCount),
    drainedL: pickValue(values, FUEL_STAT_LABELS.drainedL) ?? 0,
    fuelConsumedL: pickValue(values, FUEL_STAT_LABELS.fuelConsumedL),
    averageFuelConsumptionLPer100Km: pickValue(
      values,
      FUEL_STAT_LABELS.averageFuelConsumption,
    ),
    parkingCount: pickCount(values, FUEL_STAT_LABELS.parkingCount),
    rawReportStats: raw,
    warnings,
  };
}

export function shouldLoadFuelChronology(stats: ParsedFuelDailyStats): boolean {
  return stats.refillCount > 0 || stats.drainCount > 0;
}

export type FuelReportParseResult = {
  daily: ParsedFuelDailyStats;
  chronologyRows: WialonTableRow[];
};

export function parseFuelReport(input: {
  stats: WialonStatRow[];
  rows?: WialonTableRow[];
}): FuelReportParseResult {
  return {
    daily: parseFuelDailyStats(input.stats),
    chronologyRows: input.rows ?? [],
  };
}
