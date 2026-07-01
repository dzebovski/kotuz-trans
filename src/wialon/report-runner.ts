import { getServerEnv } from "@/config/env";
import { sleep } from "@/utils/timeout";
import { WialonClient } from "./client";
import { WialonReportError } from "./errors";
import {
  normalizeSelectRowsResponse,
  normalizeStatRows,
} from "./normalize-report";
import type {
  ExecReportParams,
  ReportInterval,
  WialonApplyReportResult,
  WialonChartJson,
  WialonReportAttachment,
  WialonReportStatus,
  WialonStatRow,
  WialonTableRow,
} from "./types";
import { findSpeedChartDataset } from "./parsers/speed-chart";
import { WialonError } from "./errors";

export type FetchRowsOptions = {
  pageSize?: number;
  rowSelectLevel?: number;
};

export type RunReportOptions = {
  client?: WialonClient;
  pollIntervalMs?: number;
  reportTimeoutMs?: number;
  loadRows?: boolean;
  fetchChartJson?: boolean;
  chartRenderWidth?: number;
  rowSelectLevel?: number;
  selectRows?: (tableIndex: number, totalRows: number) => Promise<WialonTableRow[]>;
  resolveTableIndices?: (ctx: {
    stats: WialonStatRow[];
    tables: NonNullable<WialonApplyReportResult["reportResult"]>["tables"];
  }) => number[];
};

export type RunReportResult = {
  stats: WialonStatRow[];
  rows: WialonTableRow[];
  tables: NonNullable<WialonApplyReportResult["reportResult"]>["tables"];
  chartJson: WialonChartJson | null;
  chartFetchWarning?: string;
};

export function getChartAttachmentCount(
  applied: WialonApplyReportResult,
): number {
  const attachments = applied.reportResult?.attachments;
  if (typeof attachments === "number") {
    return attachments > 0 ? attachments : 0;
  }
  if (Array.isArray(attachments)) {
    return attachments.length;
  }
  return 0;
}

function attachmentHasSpeedDatasetMeta(
  attachment: WialonReportAttachment,
): boolean {
  const name = attachment?.name?.toLowerCase() ?? "";
  if (name.includes("скорост") || name.includes("speed")) {
    return true;
  }
  return (attachment?.datasets ?? []).some((dataset) => {
    const label = dataset.toLowerCase();
    return label.includes("скорост") || label.includes("speed");
  });
}

export function resolveChartAttachmentIndices(
  applied: WialonApplyReportResult,
): number[] {
  const count = getChartAttachmentCount(applied);
  if (count === 0) {
    return [];
  }

  const attachments = applied.reportResult?.attachments;
  if (Array.isArray(attachments)) {
    const speedIndex = attachments.findIndex((attachment) =>
      attachmentHasSpeedDatasetMeta(attachment),
    );
    if (speedIndex >= 0) {
      return [
        speedIndex,
        ...Array.from({ length: count }, (_, index) => index).filter(
          (index) => index !== speedIndex,
        ),
      ];
    }

    const chartIndex = attachments.findIndex(
      (attachment) =>
        attachment.type === "chart" ||
        attachment.type === "graph" ||
        attachment.name?.toLowerCase().includes("chart") ||
        attachment.name?.toLowerCase().includes("граф"),
    );
    const preferred = chartIndex >= 0 ? chartIndex : 0;
    return [
      preferred,
      ...Array.from({ length: count }, (_, index) => index).filter(
        (index) => index !== preferred,
      ),
    ];
  }

  return Array.from({ length: count }, (_, index) => index);
}

export function resolveChartAttachmentIndex(
  applied: WialonApplyReportResult,
): number {
  return resolveChartAttachmentIndices(applied)[0] ?? 0;
}

async function fetchReportChartJson(
  client: WialonClient,
  applied: WialonApplyReportResult,
  width: number,
  interval: ReportInterval,
): Promise<{ chartJson: WialonChartJson | null; warning?: string }> {
  const attachmentIndices = resolveChartAttachmentIndices(applied);
  if (attachmentIndices.length === 0) {
    return { chartJson: null, warning: "Fuel report has no chart attachments" };
  }

  let lastChartJson: WialonChartJson | null = null;
  let fetchWarning: string | undefined;

  for (const attachmentIndex of attachmentIndices) {
    try {
      const chartJson = await client.call<WialonChartJson>("report/render_json", {
        attachmentIndex,
        width: Math.max(1, Math.round(width)),
        useCrop: 0,
        cropBegin: interval.from,
        cropEnd: interval.to,
      });
      lastChartJson = chartJson;
      if (findSpeedChartDataset(chartJson)) {
        return { chartJson };
      }
    } catch (error) {
      const message =
        error instanceof WialonError
          ? error.message
          : error instanceof Error
            ? error.message
            : "unknown error";
      fetchWarning = `Fuel report chart fetch failed: ${message}`;
    }
  }

  return {
    chartJson: lastChartJson,
    warning: fetchWarning ?? "Fuel report chart has no speed dataset",
  };
}

export async function runWialonReport(
  params: ExecReportParams,
  options: RunReportOptions = {},
): Promise<RunReportResult> {
  let pollIntervalMs = options.pollIntervalMs ?? 1500;
  let reportTimeoutMs = options.reportTimeoutMs ?? 60000;
  if (options.pollIntervalMs == null || options.reportTimeoutMs == null) {
    try {
      const env = getServerEnv();
      if (options.pollIntervalMs == null) {
        pollIntervalMs = env.WIALON_POLL_INTERVAL_MS;
      }
      if (options.reportTimeoutMs == null) {
        reportTimeoutMs = env.WIALON_REPORT_TIMEOUT_MS;
      }
    } catch {
      // Tests may inject explicit timeouts without full env.
    }
  }
  const client = options.client ?? new WialonClient();
  const loadRows = options.loadRows ?? true;

  let reportStarted = false;
  const ownedClient = !options.client;

  try {
    if (ownedClient) {
      await client.login();
    }

    await client.call("report/exec_report", {
      reportResourceId: params.reportResourceId,
      reportTemplateId: params.reportTemplateId,
      reportTemplate: null,
      reportObjectId: params.reportObjectId,
      reportObjectSecId: params.reportObjectSecId,
      interval: params.interval,
      remoteExec: params.remoteExec,
    });
    reportStarted = true;

    const deadline = Date.now() + reportTimeoutMs;
    let ready = false;
    while (Date.now() < deadline) {
      const statusResponse = await client.call<{ status?: WialonReportStatus | string }>(
        "report/get_report_status",
        {},
      );
      const status = Number(statusResponse.status ?? 0);
      if (status === 4) {
        ready = true;
        break;
      }
      if (status === 8) {
        throw new WialonReportError("Report was canceled", status);
      }
      if (status === 16) {
        throw new WialonReportError("Report not found or failed", status);
      }
      await sleep(pollIntervalMs);
    }

    if (!ready) {
      throw new WialonReportError(
        `Report polling timed out after ${reportTimeoutMs}ms (last status may still be running on server)`,
      );
    }

    const applied = await client.call<WialonApplyReportResult>(
      "report/apply_report_result",
      {},
    );
    const stats = normalizeStatRows(applied.reportResult?.stats ?? []);
    const tables = applied.reportResult?.tables ?? [];

    let chartJson: WialonChartJson | null = null;
    let chartFetchWarning: string | undefined;
    if (options.fetchChartJson) {
      const chartResult = await fetchReportChartJson(
        client,
        applied,
        options.chartRenderWidth ?? 1200,
        params.interval,
      );
      chartJson = chartResult.chartJson;
      chartFetchWarning = chartResult.warning;
    }

    const rows: WialonTableRow[] = [];
    if (loadRows && tables.length > 0) {
      const tableIndices =
        options.resolveTableIndices?.({ stats, tables }) ?? [0];
      const rowSelectLevel = options.rowSelectLevel ?? 1;

      for (const tableIndex of tableIndices) {
        const totalRows = tables[tableIndex]?.rows ?? 0;
        if (totalRows <= 0) {
          continue;
        }
        if (options.selectRows) {
          rows.push(...(await options.selectRows(tableIndex, totalRows)));
        } else {
          rows.push(
            ...(await fetchAllRows(client, tableIndex, totalRows, {
              rowSelectLevel,
            })),
          );
        }
      }
    }

    return { stats, rows, tables, chartJson, chartFetchWarning };
  } finally {
    if (reportStarted) {
      try {
        await client.call("report/cleanup_result", {});
      } catch {
        // cleanup errors are logged by caller if needed
      }
    }
    if (ownedClient) {
      await client.logout();
    }
  }
}

export async function fetchAllRows(
  client: WialonClient,
  tableIndex: number,
  totalRows: number,
  options: FetchRowsOptions = {},
): Promise<WialonTableRow[]> {
  const pageSize = options.pageSize ?? 500;
  const rowSelectLevel = options.rowSelectLevel ?? 1;
  const rows: WialonTableRow[] = [];
  for (let from = 0; from < totalRows; from += pageSize) {
    const to = Math.min(from + pageSize - 1, totalRows - 1);
    const data: Record<string, number> = {
      from,
      to,
      level: rowSelectLevel,
      unitInfo: 1,
    };
    if (rowSelectLevel !== 0) {
      data.flat = 1;
      data.rawValues = 1;
    }
    const page = await client.call<unknown>("report/select_result_rows", {
      tableIndex,
      config: {
        type: "range",
        data,
      },
    });
    rows.push(...normalizeSelectRowsResponse(page));
  }
  return rows;
}
