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

  it("loads dedicated drains table when present", () => {
    const stats = [
      { n: "Всего заправок", c: ["0"] },
      { n: "Всего сливов", c: ["1"] },
    ];
    const tables = [
      { name: "unit_chronology", rows: 4 },
      { name: "unit_thefts", rows: 1 },
    ];

    expect(resolveFuelEventTableIndices({ stats, tables })).toEqual([1]);
  });

  it("loads fillings and drains tables when both are present", () => {
    const stats = [
      { n: "Всего заправок", c: ["1"] },
      { n: "Всего сливов", c: ["2"] },
    ];
    const tables = [
      { name: "unit_fillings", rows: 1 },
      { name: "unit_chronology", rows: 6 },
      { name: "unit_drains", rows: 2 },
    ];

    expect(resolveFuelEventTableIndices({ stats, tables })).toEqual([0, 2]);
  });

  it("loads chronology for drains when dedicated table is absent", () => {
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

  it("loads chronology when drains table has fewer rows than stats", () => {
    const stats = [
      { n: "Всего заправок", c: ["0"] },
      { n: "Всего сливов", c: ["4"] },
    ];
    const tables = [
      { name: "unit_chronology", rows: 8 },
      { name: "unit_drains", rows: 1 },
    ];

    expect(resolveFuelEventTableIndices({ stats, tables })).toEqual([1, 0]);
  });

  it("loads chronology when fillings table has fewer rows than stats", () => {
    const stats = [
      { n: "Всего заправок", c: ["3"] },
      { n: "Всего сливов", c: ["0"] },
    ];
    const tables = [
      { name: "unit_fillings", rows: 1 },
      { name: "unit_chronology", rows: 10 },
    ];

    expect(resolveFuelEventTableIndices({ stats, tables })).toEqual([0, 1]);
  });
});
