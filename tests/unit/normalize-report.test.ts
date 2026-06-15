import { describe, expect, it } from "vitest";
import {
  normalizeSelectRowsResponse,
  normalizeStatRows,
} from "@/wialon/normalize-report";
import { parseFuelReport } from "@/wialon/parsers/fuel-report";
import { parseTripsReport } from "@/wialon/parsers/trips-report";

describe("normalize report payloads", () => {
  it("normalizes tuple stats from live Wialon API", () => {
    const stats = normalizeStatRows([
      ["Пробег в поездках", "288 km"],
      ["Потрачено по ДУТ", "91 l"],
    ]);
    const parsed = parseFuelReport({ stats });
    expect(parsed.daily.mileageKm).toBe(288);
    expect(parsed.daily.fuelConsumedL).toBe(91);
  });

  it("keeps object stats from fixtures", () => {
    const stats = normalizeStatRows([
      { n: "Пробег в поездках", c: ["391 km"] },
    ]);
    expect(stats).toEqual([{ n: "Пробег в поездках", c: ["391 km"] }]);
  });

  it("normalizes array select_result_rows responses", () => {
    const rows = normalizeSelectRowsResponse([
      {
        n: 0,
        c: [{ t: "2026-06-14 17:34:47" }, { t: "288 km" }],
      },
    ]);
    const segments = parseTripsReport(rows);
    expect(segments).toHaveLength(1);
    expect(segments[0].startedAt).toBe("2026-06-14 17:34:47");
  });
});
