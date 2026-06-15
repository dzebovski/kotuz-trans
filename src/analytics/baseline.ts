import { median, sampleStdDev } from "@/utils/numbers";

export type BaselineHistoryRow = {
  reportDate: string;
  routeKey: string | null;
  routeTag: string | null;
  averageFuelConsumptionLPer100Km: number | null;
  mileageKm: number;
  highwayRatio: number | null;
  isAnomaly: boolean;
};

export type BaselineConfig = {
  lookbackDays: number;
  minSamples: number;
  highwayTolerance: number;
  minMileageKm?: number;
};

export type BaselineResult = {
  scope: "route_key" | "route_tag" | null;
  sampleSize: number;
  averageLPer100Km: number | null;
  medianLPer100Km: number | null;
  stddevLPer100Km: number;
};

function isEligible(
  row: BaselineHistoryRow,
  reportDate: string,
  highwayRatio: number | null,
  config: BaselineConfig,
): boolean {
  if (row.reportDate >= reportDate) {
    return false;
  }
  if (row.isAnomaly) {
    return false;
  }
  if (row.averageFuelConsumptionLPer100Km == null) {
    return false;
  }
  if (row.mileageKm < (config.minMileageKm ?? 20)) {
    return false;
  }
  if (
    highwayRatio != null &&
    row.highwayRatio != null &&
    (row.highwayRatio < Math.max(0, highwayRatio - config.highwayTolerance) ||
      row.highwayRatio > Math.min(1, highwayRatio + config.highwayTolerance))
  ) {
    return false;
  }
  return true;
}

function computeBaseline(
  rows: BaselineHistoryRow[],
): BaselineResult | null {
  if (rows.length === 0) {
    return null;
  }
  const values = rows
    .map((row) => row.averageFuelConsumptionLPer100Km)
    .filter((value): value is number => value != null);
  if (values.length === 0) {
    return null;
  }
  const average =
    values.reduce((sum, value) => sum + value, 0) / values.length;
  return {
    scope: null,
    sampleSize: values.length,
    averageLPer100Km: average,
    medianLPer100Km: median(values),
    stddevLPer100Km: sampleStdDev(values),
  };
}

export function calculateDynamicBaseline(input: {
  history: BaselineHistoryRow[];
  reportDate: string;
  routeKey: string | null;
  routeTag: string | null;
  highwayRatio: number | null;
  config: BaselineConfig;
}): BaselineResult | null {
  const eligible = input.history.filter((row) =>
    isEligible(row, input.reportDate, input.highwayRatio, input.config),
  );

  const exact = eligible.filter(
    (row) => input.routeKey && row.routeKey === input.routeKey,
  );
  const exactBaseline = computeBaseline(exact);
  if (exactBaseline && exactBaseline.sampleSize >= input.config.minSamples) {
    return { ...exactBaseline, scope: "route_key" };
  }

  const byTag = eligible.filter(
    (row) => input.routeTag && row.routeTag === input.routeTag,
  );
  const tagBaseline = computeBaseline(byTag);
  if (tagBaseline && tagBaseline.sampleSize >= input.config.minSamples) {
    return { ...tagBaseline, scope: "route_tag" };
  }

  return null;
}
