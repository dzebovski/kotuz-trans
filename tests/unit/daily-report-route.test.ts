import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth/require-user", () => ({
  requireUser: vi.fn(),
}));

vi.mock("@/db/trips-repository", () => ({
  listDailyTripsForReportDate: vi.fn(),
}));

vi.mock("@/config/env", () => ({
  getServerEnv: vi.fn(() => ({
    BUSINESS_TIMEZONE: "Europe/Kyiv",
  })),
}));

import { GET } from "@/app/api/reports/daily/route";
import { requireUser } from "@/lib/auth/require-user";

describe("daily report route auth", () => {
  beforeEach(() => {
    vi.mocked(requireUser).mockReset();
  });

  it("returns 401 without authenticated user", async () => {
    vi.mocked(requireUser).mockResolvedValue(null);

    const response = await GET(
      new NextRequest("http://localhost/api/reports/daily?date=2026-06-14"),
    );
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(401);
    expect(body.error).toBe("Unauthorized");
  });
});
