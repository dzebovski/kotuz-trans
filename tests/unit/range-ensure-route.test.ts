import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth/require-user", () => ({
  requireUser: vi.fn(),
}));
vi.mock("@/config/env", () => ({
  getServerEnv: vi.fn(() => ({ BUSINESS_TIMEZONE: "Europe/Kyiv" })),
}));
vi.mock("@/db/ingestion-runs-repository", () => ({
  listIngestionRunsForRange: vi.fn(),
}));
vi.mock("@/db/ingestion-queue-repository", () => ({
  enqueueIngestionDate: vi.fn(),
  listIngestionQueueForRange: vi.fn(),
}));

import { POST } from "@/app/api/reports/range/ensure/route";
import {
  enqueueIngestionDate,
  listIngestionQueueForRange,
} from "@/db/ingestion-queue-repository";
import { listIngestionRunsForRange } from "@/db/ingestion-runs-repository";
import { requireUser } from "@/lib/auth/require-user";

function request(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/reports/range/ensure", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("range ensure route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-23T10:00:00Z"));
    vi.mocked(requireUser).mockResolvedValue({ id: "user-1" } as never);
    vi.mocked(listIngestionRunsForRange).mockResolvedValue([]);
    vi.mocked(listIngestionQueueForRange).mockResolvedValue([]);
    vi.mocked(enqueueIngestionDate).mockResolvedValue({} as never);
  });

  it("does not enqueue completed final dates", async () => {
    vi.mocked(listIngestionRunsForRange).mockResolvedValue([
      {
        id: "run-1",
        job_name: "daily-fleet-report",
        report_date: "2026-06-22",
        status: "completed",
        expected_vehicles: 3,
        successful_vehicles: 3,
        failed_vehicles: 0,
        started_at: "2026-06-23T04:00:00Z",
        heartbeat_at: "2026-06-23T04:02:00Z",
        completed_at: "2026-06-23T04:02:00Z",
        is_final: true,
        last_successful_at: "2026-06-23T04:02:00Z",
        finalized_at: "2026-06-23T04:02:00Z",
        error_summary: [],
        metadata: {},
      },
    ]);

    const response = await POST(
      request({
        from: "2026-06-22",
        to: "2026-06-22",
        mode: "missing",
      }),
    );
    expect(response.status).toBe(200);
    expect(enqueueIngestionDate).not.toHaveBeenCalled();
  });

  it("queues a provisional past date as full refresh", async () => {
    vi.mocked(listIngestionRunsForRange).mockResolvedValue([
      {
        id: "run-1",
        job_name: "daily-fleet-report",
        report_date: "2026-06-22",
        status: "completed",
        expected_vehicles: 3,
        successful_vehicles: 3,
        failed_vehicles: 0,
        started_at: "2026-06-22T12:00:00Z",
        heartbeat_at: "2026-06-22T12:02:00Z",
        completed_at: "2026-06-22T12:02:00Z",
        is_final: false,
        last_successful_at: "2026-06-22T12:02:00Z",
        finalized_at: null,
        error_summary: [],
        metadata: {},
      },
    ]);

    await POST(
      request({
        from: "2026-06-22",
        to: "2026-06-22",
        mode: "missing",
      }),
    );
    expect(enqueueIngestionDate).toHaveBeenCalledWith(
      expect.objectContaining({
        reportDate: "2026-06-22",
        mode: "full_refresh",
      }),
    );
  });

  it("does not automatically enqueue today", async () => {
    await POST(
      request({
        from: "2026-06-23",
        to: "2026-06-23",
        mode: "missing",
      }),
    );
    expect(enqueueIngestionDate).not.toHaveBeenCalled();
  });
});
