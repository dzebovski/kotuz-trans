import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth/require-user", () => ({
  requireUser: vi.fn(),
}));

vi.mock("@/db/trips-repository", () => ({
  listDailyTripsForReportDate: vi.fn(),
}));

vi.mock("@/db/ingestion-runs-repository", () => ({
  getIngestionRun: vi.fn(),
}));

vi.mock("@/jobs/run-daily-fleet-report", () => ({
  DAILY_FLEET_REPORT_JOB_NAME: "daily-fleet-report",
  runDailyFleetReport: vi.fn(),
}));

vi.mock("@/config/env", () => ({
  getServerEnv: vi.fn(() => ({
    BUSINESS_TIMEZONE: "Europe/Kyiv",
    JOB_SOFT_DEADLINE_MS: 240_000,
  })),
}));

import { GET, POST } from "@/app/api/reports/daily/route";
import { getIngestionRun } from "@/db/ingestion-runs-repository";
import { listDailyTripsForReportDate } from "@/db/trips-repository";
import { runDailyFleetReport } from "@/jobs/run-daily-fleet-report";
import { requireUser } from "@/lib/auth/require-user";

function authenticate(): void {
  vi.mocked(requireUser).mockResolvedValue({
    id: "user-1",
  } as unknown as Awaited<ReturnType<typeof requireUser>>);
}

function postRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/reports/daily", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function ingestionRun(status: "running" | "completed" | "partial" | "failed") {
  return {
    id: "run-1",
    job_name: "daily-fleet-report",
    report_date: "2026-06-14",
    status,
    expected_vehicles: 24,
    successful_vehicles: status === "running" ? 8 : 22,
    failed_vehicles: status === "running" ? 1 : status === "completed" ? 0 : 2,
    started_at: "2026-06-15T04:00:00.000Z",
    heartbeat_at: "2026-06-15T04:01:00.000Z",
    completed_at:
      status === "running" ? null : "2026-06-15T04:02:00.000Z",
    is_final: status === "completed",
    last_successful_at:
      status === "running" ? null : "2026-06-15T04:02:00.000Z",
    finalized_at:
      status === "completed" ? "2026-06-15T04:02:00.000Z" : null,
    error_summary: [],
    metadata:
      status === "running"
        ? {
            phase: "processing",
            currentVehicles: [
              { wialonUnitId: 9481, displayName: "AA8670XC / AA1501XJ" },
              { wialonUnitId: 6401, displayName: "AC2096HI / AA5448XF" },
            ],
          }
        : {},
  };
}

describe("daily report route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listDailyTripsForReportDate).mockResolvedValue([]);
    vi.mocked(getIngestionRun).mockResolvedValue(null);
  });

  it("returns 401 for unauthenticated GET", async () => {
    vi.mocked(requireUser).mockResolvedValue(null);

    const response = await GET(
      new NextRequest("http://localhost/api/reports/daily?date=2026-06-14"),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("returns 401 for unauthenticated POST", async () => {
    vi.mocked(requireUser).mockResolvedValue(null);

    const response = await POST(
      postRequest({ date: "2026-06-14", force: false }),
    );

    expect(response.status).toBe(401);
    expect(runDailyFleetReport).not.toHaveBeenCalled();
  });

  it.each(["running", "completed", "partial", "failed"] as const)(
    "returns %s ingestion status",
    async (status) => {
      authenticate();
      vi.mocked(getIngestionRun).mockResolvedValue(ingestionRun(status));

      const response = await GET(
        new NextRequest("http://localhost/api/reports/daily?date=2026-06-14"),
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.ingestion).toMatchObject({
        status,
        expectedVehicles: 24,
        hasData: false,
      });
      if (status === "running") {
        expect(body.ingestion).toMatchObject({
          processedVehicles: 9,
          startedAt: "2026-06-15T04:00:00.000Z",
          heartbeatAt: "2026-06-15T04:01:00.000Z",
          phase: "processing",
          currentVehicles: [
            { wialonUnitId: 9481, displayName: "AA8670XC / AA1501XJ" },
            { wialonUnitId: 6401, displayName: "AC2096HI / AA5448XF" },
          ],
        });
      }
    },
  );

  it.each([
    { force: false, label: "first load" },
    { force: true, label: "reload" },
  ])("runs $label with force=$force and without Telegram", async ({ force }) => {
    authenticate();
    vi.mocked(runDailyFleetReport).mockResolvedValue({
      status: "completed",
      reportDate: "2026-06-14",
    });

    const response = await POST(
      postRequest({ date: "2026-06-14", force }),
    );

    expect(response.status).toBe(200);
    expect(runDailyFleetReport).toHaveBeenCalledWith({
      reportDate: "2026-06-14",
      force,
      sendTelegram: false,
      softDeadlineMs: 240_000,
    });
  });

  it("returns already_running when another ingest owns the date", async () => {
    authenticate();
    vi.mocked(runDailyFleetReport).mockResolvedValue({
      status: "skipped",
      reportDate: "2026-06-14",
      reason: "already_running",
    });

    const response = await POST(
      postRequest({ date: "2026-06-14", force: true }),
    );

    await expect(response.json()).resolves.toMatchObject({
      status: "skipped",
      reason: "already_running",
    });
  });

  it.each([
    { date: "14-06-2026", error: "Date must use YYYY-MM-DD format" },
    { date: "2026-02-30", error: "Invalid report date" },
    { date: "2999-01-01", error: "Future report dates are not allowed" },
  ])("rejects invalid date $date", async ({ date, error }) => {
    authenticate();

    const response = await POST(postRequest({ date, force: false }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error });
    expect(runDailyFleetReport).not.toHaveBeenCalled();
  });
});
