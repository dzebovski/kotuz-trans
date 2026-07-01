import {
  calculateOverSpeedDurationSeconds,
  SPEED_LIMIT_KMH,
} from "@/analytics/over-speed-duration";
import type { WialonClient } from "../client";

const MESSAGE_FLAGS = 0x0001;
const MESSAGE_FLAGS_MASK = 0xff01;
const LOAD_BATCH_SIZE = 50_000;

export type ParsedSpeedMessages = {
  durationSeconds: number;
  pointCount: number;
  thresholdKmh: number;
};

type SpeedMessage = {
  t?: number;
  pos?: { s?: number };
};

type LoadIntervalResponse = {
  messages?: SpeedMessage[];
};

export async function loadOverSpeedDurationFromMessages(
  client: WialonClient,
  unitId: number,
  fromUnix: number,
  toUnix: number,
  thresholdKmh = SPEED_LIMIT_KMH,
): Promise<{ result: ParsedSpeedMessages | null; warning?: string }> {
  try {
    const { timestamps, speedsKmh } = await loadSpeedPoints(
      client,
      unitId,
      fromUnix,
      toUnix,
    );

    if (timestamps.length === 0) {
      return {
        result: null,
        warning: "No speed messages in interval",
      };
    }

    return {
      result: {
        durationSeconds: calculateOverSpeedDurationSeconds(
          timestamps,
          speedsKmh,
          thresholdKmh,
        ),
        pointCount: timestamps.length,
        thresholdKmh,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    return {
      result: null,
      warning: `Speed messages load failed: ${message}`,
    };
  }
}

async function loadSpeedPoints(
  client: WialonClient,
  unitId: number,
  fromUnix: number,
  toUnix: number,
): Promise<{ timestamps: number[]; speedsKmh: number[] }> {
  const timestamps: number[] = [];
  const speedsKmh: number[] = [];
  let cursor = fromUnix;

  while (cursor <= toUnix) {
    const response = await client.call<LoadIntervalResponse>(
      "messages/load_interval",
      {
        itemId: unitId,
        timeFrom: cursor,
        timeTo: toUnix,
        flags: MESSAGE_FLAGS,
        flagsMask: MESSAGE_FLAGS_MASK,
        loadCount: LOAD_BATCH_SIZE,
      },
    );

    const batch = response.messages ?? [];
    if (batch.length === 0) {
      break;
    }

    for (const message of batch) {
      const timestamp = message.t;
      const speed = message.pos?.s;
      if (timestamp == null || speed == null) {
        continue;
      }
      timestamps.push(timestamp);
      speedsKmh.push(speed);
    }

    if (batch.length < LOAD_BATCH_SIZE) {
      break;
    }

    const lastTimestamp = batch[batch.length - 1]?.t;
    if (lastTimestamp == null || lastTimestamp < cursor) {
      break;
    }
    cursor = lastTimestamp + 1;
  }

  return { timestamps, speedsKmh };
}
