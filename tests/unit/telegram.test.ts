import { describe, expect, it } from "vitest";
import { chunkText, escapeHtml } from "@/utils/html";
import { formatFleetReport } from "@/telegram/formatter";
import type { FleetVehicleSummary } from "@/analytics/fleet-summary";

function vehicle(
  overrides: Partial<FleetVehicleSummary> = {},
): FleetVehicleSummary {
  return {
    displayName: "01. KA2790BA / AA2544XC",
    tractorNumber: "KA2790BA",
    mileageKm: 412,
    fuelConsumedL: 98,
    averageFuelConsumptionLPer100Km: 23.8,
    deviationPercent: null,
    baselineAverageLPer100Km: null,
    anomalyStatus: "ok",
    routeKey: "NL:DE_LUTTE>BE:OOSTENDE",
    highwayRatio: 0.94,
    firstTripAt: "2026-06-14T03:12:00.000Z",
    lastTripAt: "2026-06-14T18:45:00.000Z",
    ...overrides,
  };
}

describe("telegram formatter", () => {
  it("escapes HTML and chunks long messages", () => {
    expect(escapeHtml("<b>&\"test\"</b>")).toBe("&lt;b&gt;&amp;&quot;test&quot;&lt;/b&gt;");
    const chunks = chunkText("a".repeat(4000), 3500);
    expect(chunks.length).toBeGreaterThan(1);
  });

  it("formats Ukrainian fleet and vehicle layout", () => {
    const messages = formatFleetReport({
      reportDate: "2026-06-14",
      processed: 1,
      expected: 1,
      totalMileageKm: 412,
      totalFuelConsumedL: 98,
      averageConsumptionLPer100Km: 23.8,
      refillCount: 0,
      refilledL: 0,
      drainCount: 0,
      failedVehicles: [],
      vehicles: [vehicle()],
    });

    expect(messages[0]).toContain("Звіт флоту");
    expect(messages[0]).toContain("Підсумок");
    expect(messages[0]).toContain("Автомобілі");
    expect(messages[0]).toContain("KA2790BA / AA2544XC");
    expect(messages[0]).toContain("NL:DE_LUTTE&gt;BE:OOSTENDE");
    expect(messages[0]).toContain("06:12 — 21:45");
    expect(messages[0]).toContain("412 km");
    expect(messages[0]).toContain("98 l");
    expect(messages[0]).toContain("23.8 l/100 km");
  });

  it("shows fuel status markers and null-safe fields", () => {
    const messages = formatFleetReport({
      reportDate: "2026-06-14",
      processed: 2,
      expected: 2,
      totalMileageKm: 100,
      totalFuelConsumedL: 30,
      averageConsumptionLPer100Km: 30,
      refillCount: 0,
      refilledL: 0,
      drainCount: 0,
      failedVehicles: [],
      vehicles: [
        vehicle({
          displayName: "B truck",
          anomalyStatus: "high",
        }),
        vehicle({
          displayName: "A truck",
          anomalyStatus: "avrg",
          routeKey: null,
          fuelConsumedL: null,
          averageFuelConsumptionLPer100Km: null,
          firstTripAt: null,
          lastTripAt: null,
        }),
      ],
    });

    const text = messages.join("\n");
    expect(text.indexOf("A truck")).toBeLessThan(text.indexOf("B truck"));
    expect(text).toContain("🔴");
    expect(text).toContain("🟡");
    expect(text).toContain("Маршрут: —");
    expect(text).toContain("Час: —");
    expect(text).toContain("Паливо: —");
  });

  it("chunks long vehicle lists", () => {
    const vehicles = Array.from({ length: 30 }, (_, index) =>
      vehicle({
        displayName: `${String(index).padStart(2, "0")}. TRUCK-${index}`,
        routeKey: `NL:CITY_${index}>BE:CITY_${index + 1}`,
      }),
    );
    const messages = formatFleetReport({
      reportDate: "2026-06-14",
      processed: 30,
      expected: 30,
      totalMileageKm: 3000,
      totalFuelConsumedL: 900,
      averageConsumptionLPer100Km: 30,
      refillCount: 0,
      refilledL: 0,
      drainCount: 0,
      failedVehicles: [],
      vehicles,
    });

    expect(messages.length).toBeGreaterThan(1);
  });

  it("includes processing issues section", () => {
    const messages = formatFleetReport({
      reportDate: "2026-06-14",
      processed: 0,
      expected: 1,
      totalMileageKm: 0,
      totalFuelConsumedL: 0,
      averageConsumptionLPer100Km: null,
      refillCount: 0,
      refilledL: 0,
      drainCount: 0,
      failedVehicles: [{ wialonUnitId: 1234, reason: "timeout" }],
      vehicles: [],
    });

    expect(messages[0]).toContain("Помилки обробки");
    expect(messages[0]).toContain("unit 1234");
  });
});
