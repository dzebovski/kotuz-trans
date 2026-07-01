import { getServerEnv } from "@/config/env";
import { sanitizeExternalErrorBody, WialonError } from "./errors";

const DEFAULT_GEOCODE_FLAGS = 1_255_211_008;

export function resolveGeocodeBaseUrl(apiUrl: string): string {
  try {
    const url = new URL(apiUrl);
    if (url.hostname.includes("moniterra.services")) {
      return "https://geocode-maps.wialon.com/hst-api.wialon.com";
    }
    if (url.hostname.endsWith("wialon.com")) {
      const host = url.hostname.startsWith("hst-api.")
        ? url.hostname
        : "hst-api.wialon.com";
      return `https://geocode-maps.wialon.com/${host}`;
    }
    return `${url.origin}/gis_geocode`.replace(/\/gis_geocode$/, "");
  } catch {
    return "https://geocode-maps.wialon.com/hst-api.wialon.com";
  }
}

async function requestGeocodeAddresses(input: {
  geocodeBase: string;
  sessionId: string;
  coordinates: Array<{ latitude: number; longitude: number }>;
  searchProvider: string;
  fetchImpl: typeof fetch;
}): Promise<Array<string | null>> {
  const params = new URLSearchParams();
  params.set(
    "coords",
    JSON.stringify(
      input.coordinates.map((coordinate) => ({
        lon: coordinate.longitude,
        lat: coordinate.latitude,
      })),
    ),
  );
  params.set("gis_sid", input.sessionId);
  params.set("flags", String(DEFAULT_GEOCODE_FLAGS));
  params.set("search_provider", input.searchProvider);
  params.set("lang", "uk");

  const response = await input.fetchImpl(
    `${input.geocodeBase}/gis_geocode?${params.toString()}`,
  );
  const text = await response.text();

  if (!response.ok) {
    throw new WialonError(
      "gis_geocode",
      `HTTP ${response.status}: ${sanitizeExternalErrorBody(text)}`,
    );
  }

  let payload: unknown;
  try {
    payload = JSON.parse(text) as unknown;
  } catch {
    throw new WialonError(
      "gis_geocode",
      `Invalid JSON response: ${sanitizeExternalErrorBody(text)}`,
    );
  }

  if (!Array.isArray(payload)) {
    if (
      typeof payload === "object" &&
      payload != null &&
      "error" in payload &&
      typeof (payload as { error?: number }).error === "number"
    ) {
      const errorPayload = payload as { error: number; reason?: string };
      throw new WialonError(
        "gis_geocode",
        errorPayload.reason ?? `Geocode error ${errorPayload.error}`,
        errorPayload.error,
      );
    }
    throw new WialonError("gis_geocode", "Unexpected geocode response shape");
  }

  return payload.map((address) => {
    if (typeof address !== "string") {
      return null;
    }
    const trimmed = address.trim();
    return trimmed.length > 0 ? trimmed : null;
  });
}

function pickGeocodeProviders(
  coordinates: Array<{ latitude: number; longitude: number }>,
): string[] {
  const inUkraine = coordinates.every(
    (coordinate) =>
      coordinate.latitude >= 44 &&
      coordinate.latitude <= 53 &&
      coordinate.longitude >= 22 &&
      coordinate.longitude <= 41,
  );
  return inUkraine ? ["yandex", "google"] : ["google", "yandex"];
}

export async function reverseGeocodeCoordinates(input: {
  sessionId: string;
  coordinates: Array<{ latitude: number; longitude: number }>;
  apiUrl?: string;
  fetchImpl?: typeof fetch;
}): Promise<Array<string | null>> {
  if (input.coordinates.length === 0) {
    return [];
  }

  const apiUrl = input.apiUrl ?? getServerEnv().WIALON_API_URL;
  const fetchImpl = input.fetchImpl ?? fetch;
  const geocodeBase = resolveGeocodeBaseUrl(apiUrl);
  const providers = pickGeocodeProviders(input.coordinates);

  for (const searchProvider of providers) {
    const addresses = await requestGeocodeAddresses({
      geocodeBase,
      sessionId: input.sessionId,
      coordinates: input.coordinates,
      searchProvider,
      fetchImpl,
    });
    if (addresses.some((address) => address != null)) {
      return addresses;
    }
  }

  return input.coordinates.map(() => null);
}
