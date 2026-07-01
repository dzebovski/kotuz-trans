import { describe, expect, it } from "vitest";
import {
  findSpeedChartDataset,
  parseSpeedChartOverLimitDuration,
} from "@/wialon/parsers/speed-chart";
import type { WialonChartJson } from "@/wialon/types";

const sampleChart: WialonChartJson = {
  datasets: {
    "0": {
      name: "Скорость, km/h",
      units: "km/h",
      y_axis: 0,
      data: {
        x: [1000, 1100, 1200, 1300],
        y: [0, 88, 86, 90],
      },
    },
    "1": {
      name: "Уровень топлива, liters",
      units: "liters",
      y_axis: 1,
      data: {
        x: [1000, 1100, 1200, 1300],
        y: [100, 99, 98, 97],
      },
    },
  },
};

describe("findSpeedChartDataset", () => {
  it("picks speed dataset among fuel chart lines", () => {
    const dataset = findSpeedChartDataset(sampleChart);
    expect(dataset?.name).toContain("Скорость");
    expect(dataset?.data?.y).toEqual([0, 88, 86, 90]);
  });

  it("returns null when chart has no datasets", () => {
    expect(findSpeedChartDataset(null)).toBeNull();
    expect(findSpeedChartDataset({})).toBeNull();
  });
});

describe("parseSpeedChartOverLimitDuration", () => {
  it("computes duration for speed above 86 km/h", () => {
    const { result, warning } = parseSpeedChartOverLimitDuration(sampleChart);
    expect(warning).toBeUndefined();
    expect(result).toEqual({
      durationSeconds: 100,
      pointCount: 4,
      thresholdKmh: 86,
    });
  });

  it("returns warning when speed dataset is missing", () => {
    const { result, warning } = parseSpeedChartOverLimitDuration({
      datasets: {
        "1": {
          name: "Уровень топлива, liters",
          units: "liters",
          y_axis: 1,
          data: { x: [1], y: [100] },
        },
      },
    });
    expect(result).toBeNull();
    expect(warning).toContain("no speed dataset");
  });
});
