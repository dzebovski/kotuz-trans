import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth/require-user", () => ({
  requireUser: vi.fn(),
}));
vi.mock("@/config/env", () => ({
  getServerEnv: vi.fn(() => ({ BUSINESS_TIMEZONE: "Europe/Kyiv" })),
}));
vi.mock("@/db/ingestion-events-repository", () => ({
  listIngestionEventsForRange: vi.fn(),
}));
vi.mock("@/db/ingestion-queue-repository", () => ({
  listIngestionQueueForRange: vi.fn(),
}));
vi.mock("@/db/ingestion-runs-repository", () => ({
  listRunVehiclesWithNamesForRange: vi.fn(),
}));

import { GET } from "@/app/api/reports/range/diagnostics/route";
import { listIngestionEventsForRange } from "@/db/ingestion-events-repository";
import { listIngestionQueueForRange } from "@/db/ingestion-queue-repository";
import { listRunVehiclesWithNamesForRange } from "@/db/ingestion-runs-repository";
import { requireUser } from "@/lib/auth/require-user";

function request(from: string, to: string, date?: string): NextRequest {
  const params = new URLSearchParams({ from, to });
  if (date) {
    params.set("date", date);
  }
  return new NextRequest(
    `http://localhost/api/reports/range/diagnostics?${params.toString()}`,
  );
}

describe("range diagnostics GET route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-29T10:00:00Z"));
    vi.mocked(requireUser).mockResolvedValue({ id: "user-1" } as never);
    vi.mocked(listIngestionQueueForRange).mockResolvedValue([]);
    vi.mocked(listIngestionEventsForRange).mockResolvedValue([]);
    vi.mocked(listRunVehiclesWithNamesForRange).mockResolvedValue([
      {
        reportDate: "2026-06-23",
        runId: "run-1",
        runStatus: "partial",
        vehicleId: "vehicle-1",
        displayName: "KA2790BA",
        tractorNumber: "KA2790BA",
        wialonUnitId: 101,
        status: "failed",
        attempts: 2,
        lastError: "Wialon timeout",
        startedAt: null,
        completedAt: null,
      },
      {
        reportDate: "2026-06-23",
        runId: "run-1",
        runStatus: "partial",
        vehicleId: "vehicle-2",
        displayName: "KA6149BC",
        tractorNumber: "KA6149BC",
        wialonUnitId: 102,
        status: "completed",
        attempts: 1,
        lastError: null,
        startedAt: null,
        completedAt: null,
      },
    ]);
  });

  it("returns per-day failed vehicles for a single date", async () => {
    const response = await GET(request("2026-06-22", "2026-06-28", "2026-06-23"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.days).toHaveLength(1);
    expect(json.days[0].failedVehicles).toHaveLength(1);
    expect(json.days[0].failedVehicles[0]).toMatchObject({
      displayName: "KA2790BA",
      lastError: "Wialon timeout",
    });
  });
});
