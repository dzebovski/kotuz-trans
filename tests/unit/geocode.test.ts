import { describe, expect, it, vi } from "vitest";
import {
  resolveGeocodeBaseUrl,
  reverseGeocodeCoordinates,
} from "@/wialon/geocode";

describe("reverseGeocodeCoordinates", () => {
  it("resolves geocode host for custom Wialon deployments", () => {
    expect(resolveGeocodeBaseUrl("https://moniterra.services/wialon/ajax.html")).toBe(
      "https://geocode-maps.wialon.com/hst-api.wialon.com",
    );
    expect(resolveGeocodeBaseUrl("https://hst-api.wialon.com/wialon/ajax.html")).toBe(
      "https://geocode-maps.wialon.com/hst-api.wialon.com",
    );
  });

  it("requests addresses for coordinates", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify(["вул. Шевченка, Полтава, Україна"])),
    );

    const addresses = await reverseGeocodeCoordinates({
      sessionId: "session-1",
      apiUrl: "https://moniterra.services/wialon/ajax.html",
      coordinates: [{ latitude: 49.583667, longitude: 34.18402 }],
      fetchImpl,
    });

    expect(addresses).toEqual(["вул. Шевченка, Полтава, Україна"]);
    expect(String(fetchImpl.mock.calls[0]?.[0])).toContain(
      "https://geocode-maps.wialon.com/hst-api.wialon.com/gis_geocode?",
    );
    expect(String(fetchImpl.mock.calls[0]?.[0])).toContain("search_provider=yandex");
    expect(String(fetchImpl.mock.calls[0]?.[0])).toContain("gis_sid=session-1");
  });
});
