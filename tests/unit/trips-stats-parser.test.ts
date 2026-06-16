import { describe, expect, it } from "vitest";
import { parseTripsDailyStats } from "@/wialon/parsers/trips-report";
import type { WialonStatRow } from "@/wialon/types";

const SAMPLE_STATS: WialonStatRow[] = [
  { n: "Время в движении", c: ["1 days 21:44:31"] },
  { n: "Количество остановок", c: ["12"] },
  { n: "Продолжительность стоянок", c: ["5:30:15"] },
  { n: "Количество стоянок", c: ["8"] },
  { n: "Пробег в поездках", c: ["523.4 km"] },
  { n: "Средняя скорость в поездках", c: ["68.2 km/h"] },
  { n: "Макс. скорость в поездках", c: ["92 km/h"] },
  { n: "Потрачено по ДУТ в поездках", c: ["156.7 l"] },
  { n: "Ср. расход по ДУТ в поездках", c: ["29.95 l/100 km"] },
  { n: "Невідомий показник", c: ["42"] },
];

describe("parseTripsDailyStats", () => {
  it("parses known labels by name, not order", () => {
    const shuffled: WialonStatRow[] = [...SAMPLE_STATS].reverse();
    const result = parseTripsDailyStats(shuffled);

    expect(result.movementDurationSeconds).toBe(164671);
    expect(result.stopCount).toBe(12);
    expect(result.parkingDurationSeconds).toBe(19815);
    expect(result.parkingCountFromTrips).toBe(8);
    expect(result.mileageKm).toBeCloseTo(523.4);
    expect(result.averageSpeedKmh).toBeCloseTo(68.2);
    expect(result.maxSpeedKmh).toBeCloseTo(92);
    expect(result.fuelConsumedL).toBeCloseTo(156.7);
    expect(result.averageFuelConsumptionLPer100Km).toBeCloseTo(29.95);
  });

  it("keeps unknown labels in raw without failing", () => {
    const result = parseTripsDailyStats(SAMPLE_STATS);
    expect(result.rawReportStats).toHaveLength(SAMPLE_STATS.length);
    expect(
      result.rawReportStats.some((row) => row.label === "Невідомий показник"),
    ).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  it("returns empty stats for empty input", () => {
    const result = parseTripsDailyStats([]);
    expect(result.movementDurationSeconds).toBeNull();
    expect(result.stopCount).toBe(0);
    expect(result.parkingCountFromTrips).toBe(0);
    expect(result.rawReportStats).toEqual([]);
  });
});
