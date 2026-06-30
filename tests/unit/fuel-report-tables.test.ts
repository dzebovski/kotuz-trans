import { describe, expect, it } from "vitest";
import {
  parseFuelDailyStats,
  resolveFuelEventTableIndices,
} from "@/wialon/parsers/fuel-report";

describe("resolveFuelEventTableIndices", () => {
  it("loads unit_fillings when refill stats are present", () => {
    const stats = [
      { n: "Всего заправок", c: ["1"] },
      { n: "Всего сливов", c: ["0"] },
    ];
    const tables = [
      { name: "unit_fillings", rows: 1 },
      { name: "unit_chronology", rows: 6 },
    ];

    expect(resolveFuelEventTableIndices({ stats, tables })).toEqual([0]);
    expect(parseFuelDailyStats(stats).refillCount).toBe(1);
  });

  it("loads chronology for drains when fillings table is absent", () => {
    const stats = [
      { n: "Всего заправок", c: ["0"] },
      { n: "Всего сливов", c: ["1"] },
    ];
    const tables = [{ name: "unit_chronology", rows: 4 }];

    expect(resolveFuelEventTableIndices({ stats, tables })).toEqual([0]);
  });

  it("loads chronology for refills when fillings table is absent", () => {
    const stats = [
      { n: "Всего заправок", c: ["1"] },
      { n: "Всего сливов", c: ["0"] },
    ];
    const tables = [{ name: "unit_chronology", rows: 6 }];

    expect(resolveFuelEventTableIndices({ stats, tables })).toEqual([0]);
  });
});
