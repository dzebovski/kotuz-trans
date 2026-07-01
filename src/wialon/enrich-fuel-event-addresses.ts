import type { WialonClient } from "./client";
import { reverseGeocodeCoordinates } from "./geocode";
import type { ParsedFuelEvent } from "./parsers/fuel-events";
import { log } from "@/utils/logger";

export async function enrichFuelEventAddresses(
  client: WialonClient,
  events: ParsedFuelEvent[],
): Promise<void> {
  const sessionId = client.getSessionId();
  if (!sessionId) {
    return;
  }

  const missing = events
    .map((event, index) => ({ event, index }))
    .filter(
      ({ event }) =>
        !event.address?.trim() &&
        event.latitude != null &&
        event.longitude != null,
    );

  if (missing.length === 0) {
    return;
  }

  try {
    const addresses = await reverseGeocodeCoordinates({
      sessionId,
      coordinates: missing.map(({ event }) => ({
        latitude: event.latitude!,
        longitude: event.longitude!,
      })),
    });

    for (let index = 0; index < missing.length; index += 1) {
      const address = addresses[index];
      if (address) {
        missing[index]!.event.address = address;
      }
    }
  } catch (error) {
    log("warn", "fuel_event_geocode_failed", {
      count: missing.length,
      message: error instanceof Error ? error.message : "unknown",
    });
  }
}
