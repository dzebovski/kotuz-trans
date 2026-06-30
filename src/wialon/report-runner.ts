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
  WialonApplyReportResult,
  WialonReportStatus,
  WialonStatRow,
  WialonTableRow,
} from "./types";

export type FetchRowsOptions = {
  pageSize?: number;
  rowSelectLevel?: number;
};

export type RunReportOptions = {
  client?: WialonClient;
  pollIntervalMs?: number;
  reportTimeoutMs?: number;
  loadRows?: boolean;
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
};

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

    return { stats, rows, tables };
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
