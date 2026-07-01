import {
  calculateOverSpeedDurationSeconds,
  SPEED_LIMIT_KMH,
} from "@/analytics/over-speed-duration";
import type { WialonChartJson, WialonChartDataset } from "../types";

export type ParsedSpeedChart = {
  durationSeconds: number;
  pointCount: number;
  thresholdKmh: number;
};

function isSpeedDataset(dataset: WialonChartDataset): boolean {
  const name = dataset.name?.toLowerCase() ?? "";
  const units = dataset.units?.toLowerCase() ?? "";
  if (name.includes("скорост") || name.includes("speed")) {
    return true;
  }
  return units === "km/h" && (dataset.y_axis ?? 0) === 0;
}

export function findSpeedChartDataset(
  chartJson: WialonChartJson | null | undefined,
): WialonChartDataset | null {
  if (!chartJson?.datasets) {
    return null;
  }

  const datasets = Object.values(chartJson.datasets);
  return datasets.find(isSpeedDataset) ?? null;
}

export function parseSpeedChartOverLimitDuration(
  chartJson: WialonChartJson | null | undefined,
  thresholdKmh = SPEED_LIMIT_KMH,
): { result: ParsedSpeedChart | null; warning?: string } {
  const dataset = findSpeedChartDataset(chartJson);
  if (!dataset) {
    return {
      result: null,
      warning: "Fuel report chart has no speed dataset",
    };
  }

  const x = dataset.data?.x ?? [];
  const y = dataset.data?.y ?? [];
  if (x.length !== y.length) {
    return {
      result: null,
      warning: "Speed chart dataset has mismatched x/y lengths",
    };
  }
  if (x.length === 0) {
    return {
      result: null,
      warning: "Speed chart dataset is empty",
    };
  }

  return {
    result: {
      durationSeconds: calculateOverSpeedDurationSeconds(x, y, thresholdKmh),
      pointCount: x.length,
      thresholdKmh,
    },
  };
}
