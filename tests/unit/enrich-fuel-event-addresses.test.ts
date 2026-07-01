import { describe, expect, it, vi } from "vitest";
import type { WialonClient } from "@/wialon/client";
import { enrichFuelEventAddresses } from "@/wialon/enrich-fuel-event-addresses";
import type { ParsedFuelEvent } from "@/wialon/parsers/fuel-events";

vi.mock("@/wialon/geocode", () => ({
  reverseGeocodeCoordinates: vi.fn(async () => [
    "вул. Соборності, Полтава, Полтавська обл., Україна",
  ]),
}));

import { reverseGeocodeCoordinates } from "@/wialon/geocode";

function drainEvent(overrides: Partial<ParsedFuelEvent> = {}): ParsedFuelEvent {
  return {
    eventType: "drain",
    eventTime: "2026-06-25 20:25:40",
    volumeL: 10.22,
    latitude: 49.583667,
    longitude: 34.18402,
    address: null,
    sourceRowNumber: 0,
    rawEvent: {},
    ...overrides,
  };
}

describe("enrichFuelEventAddresses", () => {
  it("fills missing addresses from reverse geocoding", async () => {
    const client = {
      getSessionId: () => "session-1",
    } as WialonClient;
    const events = [drainEvent()];

    await enrichFuelEventAddresses(client, events);

    expect(reverseGeocodeCoordinates).toHaveBeenCalledWith({
      sessionId: "session-1",
      coordinates: [{ latitude: 49.583667, longitude: 34.18402 }],
    });
    expect(events[0]?.address).toBe(
      "вул. Соборності, Полтава, Полтавська обл., Україна",
    );
  });

  it("skips events that already have an address", async () => {
    vi.mocked(reverseGeocodeCoordinates).mockClear();
    const client = {
      getSessionId: () => "session-1",
    } as WialonClient;

    await enrichFuelEventAddresses(client, [
      drainEvent({ address: "8400 Oostende, Belgium" }),
    ]);

    expect(reverseGeocodeCoordinates).not.toHaveBeenCalled();
  });
});
