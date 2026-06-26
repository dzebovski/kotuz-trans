import { describe, expect, it } from "vitest";
import {
  countFuelStatusByVehicle,
  evaluateFuelConsumptionStatus,
  formatFuelStatusBadgeLabel,
  formatReportDaysLabel,
  fuelStatusLabel,
  worstFuelStatus,
} from "@/analytics/fuel-consumption-status";

describe("evaluateFuelConsumptionStatus", () => {
  it("returns not_evaluated without actual or tier", () => {
    expect(evaluateFuelConsumptionStatus(null, 30)).toBe("not_evaluated");
    expect(evaluateFuelConsumptionStatus(25, null)).toBe("not_evaluated");
  });

  it("classifies tier 30 boundaries", () => {
    expect(evaluateFuelConsumptionStatus(27, 30)).toBe("normal");
    expect(evaluateFuelConsumptionStatus(26.9, 30)).toBe("normal");
    expect(evaluateFuelConsumptionStatus(27.1, 30)).toBe("avrg");
    expect(evaluateFuelConsumptionStatus(30, 30)).toBe("avrg");
    expect(evaluateFuelConsumptionStatus(30.1, 30)).toBe("high");
  });

  it("classifies tier 32 boundaries", () => {
    expect(evaluateFuelConsumptionStatus(29, 32)).toBe("normal");
    expect(evaluateFuelConsumptionStatus(28.9, 32)).toBe("normal");
    expect(evaluateFuelConsumptionStatus(29.1, 32)).toBe("avrg");
    expect(evaluateFuelConsumptionStatus(32, 32)).toBe("avrg");
    expect(evaluateFuelConsumptionStatus(32.1, 32)).toBe("high");
  });
});

describe("worstFuelStatus", () => {
  it("ignores not_evaluated and picks the worst status", () => {
    expect(
      worstFuelStatus(["not_evaluated", "normal", "avrg", "high"]),
    ).toBe("high");
    expect(worstFuelStatus(["not_evaluated", "normal", "avrg"])).toBe("avrg");
    expect(worstFuelStatus(["not_evaluated"])).toBeNull();
  });
});

describe("formatReportDaysLabel", () => {
  it("uses correct Ukrainian day plural forms", () => {
    expect(formatReportDaysLabel(1)).toBe("Звіт за 1 день");
    expect(formatReportDaysLabel(2)).toBe("Звіт за 2 дня");
    expect(formatReportDaysLabel(3)).toBe("Звіт за 3 дня");
    expect(formatReportDaysLabel(4)).toBe("Звіт за 4 дня");
    expect(formatReportDaysLabel(5)).toBe("Звіт за 5 днів");
    expect(formatReportDaysLabel(7)).toBe("Звіт за 7 днів");
    expect(formatReportDaysLabel(11)).toBe("Звіт за 11 днів");
    expect(formatReportDaysLabel(21)).toBe("Звіт за 21 день");
    expect(formatReportDaysLabel(22)).toBe("Звіт за 22 дня");
  });
});

describe("fuelStatusLabel", () => {
  it("maps statuses to Ukrainian labels", () => {
    expect(fuelStatusLabel("normal")).toBe("нормальний розхід");
    expect(fuelStatusLabel("avrg")).toBe("середній розхід");
    expect(fuelStatusLabel("high")).toBe("високий розхід");
    expect(fuelStatusLabel("not_evaluated")).toBeNull();
    expect(fuelStatusLabel(null)).toBeNull();
  });
});

describe("formatFuelStatusBadgeLabel", () => {
  it("formats badge with capitalized label and liters", () => {
    expect(formatFuelStatusBadgeLabel("avrg", 28)).toBe("Середній розхід - 28л");
    expect(formatFuelStatusBadgeLabel("normal", 26.4)).toBe(
      "Нормальний розхід - 26,4л",
    );
    expect(formatFuelStatusBadgeLabel("high", 31.25)).toBe(
      "Високий розхід - 31,3л",
    );
  });

  it("returns label only when consumption is missing", () => {
    expect(formatFuelStatusBadgeLabel("avrg", null)).toBe("Середній розхід");
    expect(formatFuelStatusBadgeLabel("not_evaluated", 28)).toBeNull();
  });
});

describe("countFuelStatusByVehicle", () => {
  it("counts vehicles by fuel status", () => {
    expect(
      countFuelStatusByVehicle([
        { fuelStatus: "normal" },
        { fuelStatus: "normal" },
        { fuelStatus: "avrg" },
        { fuelStatus: "high" },
        { fuelStatus: null },
        { fuelStatus: "not_evaluated" },
      ]),
    ).toEqual({ normal: 2, avrg: 1, high: 1 });
  });
});
