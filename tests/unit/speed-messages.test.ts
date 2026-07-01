import { describe, expect, it, vi } from "vitest";
import { loadOverSpeedDurationFromMessages } from "@/wialon/parsers/speed-messages";
import type { WialonClient } from "@/wialon/client";

function mockClient(
  batches: Array<Array<{ t?: number; pos?: { s?: number } }>>,
): WialonClient {
  let callIndex = 0;
  return {
    call: vi.fn(async () => {
      const messages = batches[callIndex] ?? [];
      callIndex += 1;
      return { messages };
    }),
  } as unknown as WialonClient;
}

describe("loadOverSpeedDurationFromMessages", () => {
  it("computes duration from GPS message speeds", async () => {
    const client = mockClient([
      [
        { t: 1000, pos: { s: 0 } },
        { t: 1100, pos: { s: 88 } },
        { t: 1200, pos: { s: 86 } },
        { t: 1300, pos: { s: 90 } },
      ],
    ]);

    const { result, warning } = await loadOverSpeedDurationFromMessages(
      client,
      6401,
      1000,
      1300,
    );

    expect(warning).toBeUndefined();
    expect(result).toEqual({
      durationSeconds: 100,
      pointCount: 4,
      thresholdKmh: 86,
    });
  });

  it("paginates when a batch is full", async () => {
    const fullBatch = Array.from({ length: 50_000 }, (_, index) => ({
      t: index,
      pos: { s: 70 },
    }));
    const tailBatch = [
      { t: 50_000, pos: { s: 88 } },
      { t: 50_100, pos: { s: 0 } },
    ];
    const client = mockClient([fullBatch, tailBatch]);

    const { result } = await loadOverSpeedDurationFromMessages(
      client,
      6401,
      0,
      50_100,
    );

    expect(client.call).toHaveBeenCalledTimes(2);
    expect(result?.durationSeconds).toBe(100);
    expect(result?.pointCount).toBe(50_002);
  });

  it("returns warning when no speed messages exist", async () => {
    const client = mockClient([[]]);

    const { result, warning } = await loadOverSpeedDurationFromMessages(
      client,
      6401,
      1000,
      2000,
    );

    expect(result).toBeNull();
    expect(warning).toContain("No speed messages");
  });

  it("returns warning when Wialon call fails", async () => {
    const client = {
      call: vi.fn(async () => {
        throw new Error("access denied");
      }),
    } as unknown as WialonClient;

    const { result, warning } = await loadOverSpeedDurationFromMessages(
      client,
      6401,
      1000,
      2000,
    );

    expect(result).toBeNull();
    expect(warning).toContain("Speed messages load failed");
  });
});
