import type { BaselineResult } from "./baseline";

export type AnomalyStatus =
  | "not_evaluated"
  | "insufficient_history"
  | "normal"
  | "warning"
  | "critical";

export type AnomalyThresholds = {
  warningPercent: number;
  criticalPercent: number;
};

export type AnomalyEvaluation = {
  anomalyStatus: AnomalyStatus;
  isAnomaly: boolean;
  deviationPercent: number | null;
  baselineScope: string | null;
  baselineSampleSize: number | null;
  baselineAverageLPer100Km: number | null;
  baselineStddevLPer100Km: number | null;
};

export function evaluateFuelAnomaly(input: {
  actualConsumption: number | null;
  baseline: BaselineResult | null;
  thresholds: AnomalyThresholds;
  dataQualityBlocked?: boolean;
}): AnomalyEvaluation {
  const empty: AnomalyEvaluation = {
    anomalyStatus: "not_evaluated",
    isAnomaly: false,
    deviationPercent: null,
    baselineScope: null,
    baselineSampleSize: null,
    baselineAverageLPer100Km: null,
    baselineStddevLPer100Km: null,
  };

  if (input.dataQualityBlocked) {
    return { ...empty, anomalyStatus: "not_evaluated" };
  }

  if (!input.baseline || input.actualConsumption == null) {
    return { ...empty, anomalyStatus: "insufficient_history" };
  }

  const average = input.baseline.averageLPer100Km;
  if (average == null || average <= 0) {
    return {
      ...empty,
      anomalyStatus: "insufficient_history",
      baselineScope: input.baseline.scope,
      baselineSampleSize: input.baseline.sampleSize,
      baselineAverageLPer100Km: average,
      baselineStddevLPer100Km: input.baseline.stddevLPer100Km,
    };
  }

  const deviationPercent =
    ((input.actualConsumption - average) / average) * 100;

  const warningThreshold = Math.max(
    average * (1 + input.thresholds.warningPercent / 100),
    average + 1.5 * input.baseline.stddevLPer100Km,
  );
  const criticalThreshold = Math.max(
    average * (1 + input.thresholds.criticalPercent / 100),
    average + 2 * input.baseline.stddevLPer100Km,
  );

  let anomalyStatus: AnomalyStatus = "normal";
  let isAnomaly = false;
  if (input.actualConsumption > criticalThreshold) {
    anomalyStatus = "critical";
    isAnomaly = true;
  } else if (input.actualConsumption > warningThreshold) {
    anomalyStatus = "warning";
    isAnomaly = true;
  }

  return {
    anomalyStatus,
    isAnomaly,
    deviationPercent,
    baselineScope: input.baseline.scope,
    baselineSampleSize: input.baseline.sampleSize,
    baselineAverageLPer100Km: average,
    baselineStddevLPer100Km: input.baseline.stddevLPer100Km,
  };
}
