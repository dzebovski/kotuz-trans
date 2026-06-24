import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth/require-user", () => ({
  requireUser: vi.fn(),
}));
vi.mock("@/config/env", () => ({
  getServerEnv: vi.fn(() => ({ BUSINESS_TIMEZONE: "Europe/Kyiv" })),
}));
vi.mock("@/jobs/ingestion-queue-worker", () => ({
  enqueueMissingDatesForRange: vi.fn(),
}));

import { POST } from "@/app/api/reports/range/ensure/route";
import { enqueueMissingDatesForRange } from "@/jobs/ingestion-queue-worker";
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
    vi.mocked(enqueueMissingDatesForRange).mockResolvedValue({
      queued: [],
      skipped: [],
    });
  });

  it("delegates enqueue to worker", async () => {
    vi.mocked(enqueueMissingDatesForRange).mockResolvedValue({
      queued: ["2026-06-22"],
      skipped: [],
    });

    const response = await POST(
      request({
        from: "2026-06-22",
        to: "2026-06-22",
        mode: "missing",
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.queued).toEqual(["2026-06-22"]);
    expect(enqueueMissingDatesForRange).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "2026-06-22",
        to: "2026-06-22",
        mode: "missing",
        today: "2026-06-23",
      }),
    );
  });

  it("passes retryFailed to worker", async () => {
    await POST(
      request({
        from: "2026-06-20",
        to: "2026-06-22",
        mode: "missing",
        retryFailed: true,
      }),
    );

    expect(enqueueMissingDatesForRange).toHaveBeenCalledWith(
      expect.objectContaining({
        retryFailed: true,
      }),
    );
  });
});
