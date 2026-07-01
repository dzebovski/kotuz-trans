import { describe, expect, it } from "vitest";
import {
  getChartAttachmentCount,
  resolveChartAttachmentIndex,
  resolveChartAttachmentIndices,
} from "@/wialon/report-runner";
import type { WialonApplyReportResult } from "@/wialon/types";

describe("chart attachment helpers", () => {
  it("reads numeric attachment count from apply_report_result", () => {
    const applied: WialonApplyReportResult = {
      reportResult: { attachments: 2 },
    };
    expect(getChartAttachmentCount(applied)).toBe(2);
    expect(resolveChartAttachmentIndex(applied)).toBe(0);
    expect(resolveChartAttachmentIndices(applied)).toEqual([0, 1]);
  });

  it("reads attachment array length", () => {
    const applied: WialonApplyReportResult = {
      reportResult: {
        attachments: [
          { name: "table export", type: "file" },
          { name: "fuel chart", type: "chart" },
        ],
      },
    };
    expect(getChartAttachmentCount(applied)).toBe(2);
    expect(resolveChartAttachmentIndex(applied)).toBe(1);
    expect(resolveChartAttachmentIndices(applied)).toEqual([1, 0]);
  });

  it("prefers chart attachment that includes speed dataset metadata", () => {
    const applied: WialonApplyReportResult = {
      reportResult: {
        attachments: [
          {
            name: "Уровень топлива",
            type: "chart",
            datasets: ["Уровень топлива, liters"],
          },
          {
            name: "График уровня со скоростью",
            type: "chart",
            datasets: ["Скорость, km/h", "Уровень топлива, liters"],
          },
        ],
      },
    };
    expect(resolveChartAttachmentIndex(applied)).toBe(1);
    expect(resolveChartAttachmentIndices(applied)).toEqual([1, 0]);
  });
});
