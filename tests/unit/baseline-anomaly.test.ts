import { describe, expect, it } from "vitest";
import { calculateDynamicBaseline } from "@/analytics/baseline";
import { evaluateFuelAnomaly } from "@/analytics/anomaly";

const history = [
  {
    reportDate: "2026-06-01",
    routeKey: "NL:DE_LUTTE>BE:OOSTENDE",
    routeTag: "EU_INTERNATIONAL",
    averageFuelConsumptionLPer100Km: 26,
    mileageKm: 300,
    highwayRatio: 0.95,
    isAnomaly: false,
  },
  {
    reportDate: "2026-06-02",
    routeKey: "NL:DE_LUTTE>BE:OOSTENDE",
    routeTag: "EU_INTERNATIONAL",
    averageFuelConsumptionLPer100Km: 27,
    mileageKm: 310,
    highwayRatio: 0.94,
    isAnomaly: false,
  },
  {
    reportDate: "2026-06-03",
    routeKey: "NL:DE_LUTTE>BE:OOSTENDE",
    routeTag: "EU_INTERNATIONAL",
    averageFuelConsumptionLPer100Km: 25,
    mileageKm: 290,
    highwayRatio: 0.96,
    isAnomaly: false,
  },
  {
    reportDate: "2026-06-04",
    routeKey: "NL:DE_LUTTE>BE:OOSTENDE",
    routeTag: "EU_INTERNATIONAL",
    averageFuelConsumptionLPer100Km: 26.5,
    mileageKm: 305,
    highwayRatio: 0.95,
    isAnomaly: false,
  },
  {
    reportDate: "2026-06-05",
    routeKey: "NL:DE_LUTTE>BE:OOSTENDE",
    routeTag: "EU_INTERNATIONAL",
    averageFuelConsumptionLPer100Km: 27.5,
    mileageKm: 320,
    highwayRatio: 0.93,
    isAnomaly: false,
  },
];

describe("baseline and anomaly", () => {
  it("uses exact route key baseline", () => {
    const baseline = calculateDynamicBaseline({
      history,
      reportDate: "2026-06-14",
      routeKey: "NL:DE_LUTTE>BE:OOSTENDE",
      routeTag: "EU_INTERNATIONAL",
      highwayRatio: 0.95,
      config: { lookbackDays: 120, minSamples: 5, highwayTolerance: 0.1 },
    });
    expect(baseline?.scope).toBe("route_key");
    expect(baseline?.sampleSize).toBe(5);
  });

  it("falls back to route tag baseline", () => {
    const baseline = calculateDynamicBaseline({
      history: history.map((row) => ({ ...row, routeKey: "OTHER:ROUTE" })),
      reportDate: "2026-06-14",
      routeKey: "NL:DE_LUTTE>BE:OOSTENDE",
      routeTag: "EU_INTERNATIONAL",
      highwayRatio: 0.95,
      config: { lookbackDays: 120, minSamples: 5, highwayTolerance: 0.1 },
    });
    expect(baseline?.scope).toBe("route_tag");
  });

  it("returns insufficient history when samples are too low", () => {
    const evaluation = evaluateFuelAnomaly({
      actualConsumption: 30,
      baseline: null,
      thresholds: { warningPercent: 15, criticalPercent: 25 },
    });
    expect(evaluation.anomalyStatus).toBe("insufficient_history");
    expect(evaluation.isAnomaly).toBe(false);
  });

  it("flags warning and critical thresholds", () => {
    const baseline = calculateDynamicBaseline({
      history,
      reportDate: "2026-06-14",
      routeKey: "NL:DE_LUTTE>BE:OOSTENDE",
      routeTag: "EU_INTERNATIONAL",
      highwayRatio: 0.95,
      config: { lookbackDays: 120, minSamples: 5, highwayTolerance: 0.1 },
    });
    const warning = evaluateFuelAnomaly({
      actualConsumption: 31,
      baseline,
      thresholds: { warningPercent: 15, criticalPercent: 25 },
    });
    expect(["warning", "critical"]).toContain(warning.anomalyStatus);

    const critical = evaluateFuelAnomaly({
      actualConsumption: 40,
      baseline,
      thresholds: { warningPercent: 15, criticalPercent: 25 },
    });
    expect(critical.anomalyStatus).toBe("critical");
  });
});
