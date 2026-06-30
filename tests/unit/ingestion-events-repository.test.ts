import { beforeEach, describe, expect, it, vi } from "vitest";

const insertMock = vi.fn();
const fromMock = vi.fn(() => ({
  insert: insertMock,
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  gte: vi.fn().mockReturnThis(),
  lte: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  limit: vi.fn().mockResolvedValue({ data: [], error: null }),
}));

vi.mock("@/db/supabase-admin", () => ({
  getSupabaseAdmin: () => ({ from: fromMock }),
}));

vi.mock("@/utils/logger", () => ({
  log: vi.fn(),
}));

import {
  logIngestionEvent,
  listIngestionEventsForRange,
} from "@/db/ingestion-events-repository";

describe("ingestion-events-repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    insertMock.mockResolvedValue({ error: null });
  });

  it("inserts ingestion event without throwing", async () => {
    await logIngestionEvent({
      jobName: "daily-fleet-report",
      reportDate: "2026-06-23",
      scope: "vehicle",
      eventType: "failed",
      vehicleId: "vehicle-1",
      message: "Wialon timeout",
    });

    expect(fromMock).toHaveBeenCalledWith("ingestion_events");
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        job_name: "daily-fleet-report",
        report_date: "2026-06-23",
        event_type: "failed",
        message: "Wialon timeout",
      }),
    );
  });

  it("redacts sensitive messages", async () => {
    await logIngestionEvent({
      jobName: "daily-fleet-report",
      reportDate: "2026-06-23",
      scope: "vehicle",
      eventType: "failed",
      message: "invalid token in response",
    });

    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "[redacted]",
      }),
    );
  });

  it("lists events for range", async () => {
    const events = await listIngestionEventsForRange(
      "daily-fleet-report",
      "2026-06-22",
      "2026-06-28",
    );
    expect(events).toEqual([]);
    expect(fromMock).toHaveBeenCalledWith("ingestion_events");
  });
});
