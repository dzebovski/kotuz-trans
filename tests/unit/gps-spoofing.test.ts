import { describe, expect, it } from "vitest";
import { classifyRoute } from "@/analytics/route-classifier";
import { sanitizeTripSegmentsForGpsSpoofing } from "@/analytics/gps-spoofing";
import { normalizePlaceName } from "@/analytics/country-normalizer";
import type { ParsedTripSegment } from "@/wialon/parsers/trips-report";

function baseSegment(
  overrides: Partial<ParsedTripSegment>,
): ParsedTripSegment {
  return {
    sourceRowNumber: 1,
    startedAt: null,
    endedAt: null,
    durationSeconds: null,
    mileageKm: 100,
    urbanMileageKm: null,
    highwayMileageKm: null,
    averageFuelConsumptionLPer100Km: null,
    fuelConsumedL: null,
    averageSpeedKmh: null,
    maxSpeedKmh: null,
    startingFuelL: null,
    endingFuelL: null,
    startLatitude: null,
    startLongitude: null,
    startCountry: null,
    startCity: null,
    startAddress: null,
    endLatitude: null,
    endLongitude: null,
    endCountry: null,
    endCity: null,
    endAddress: null,
    rawRow: {},
    ...overrides,
  };
}

describe("gps spoofing", () => {
  it("normalizes Ukrainian place names", () => {
    expect(normalizePlaceName("Нікополь 53201", "UA")).toBe("Нікополь");
    expect(normalizePlaceName("0.85 km from Нікополь 53208", "UA")).toBe(
      "Нікополь",
    );
    expect(normalizePlaceName("1.24 km from Решетилівка 38400", "UA")).toBe(
      "Решетилівка",
    );
  });

  it("replaces spoofed Peru endpoints with Ukrainian anchor city", () => {
    const segments = [
      baseSegment({
        sourceRowNumber: 1,
        mileageKm: 7,
        startAddress: "Lima, Peru, Avenida Óscar Raimundo Benavides 899",
        startCity: "Lima",
        endAddress: "Lima, Peru, Fernando Wiesse",
        endCity: "Lima",
      }),
      baseSegment({
        sourceRowNumber: 2,
        startAddress:
          "Нікополь 53201, Україна, Дніпропетровська обл., Героїв Чорнобиля вул.",
        startCity: "Нікополь 53201",
        endAddress:
          "Дніпро 49011, Україна, Івана Мазепи просп.",
        endCity: "Дніпро 49011",
      }),
      baseSegment({
        sourceRowNumber: 3,
        endAddress:
          "Україна, Решетилівська ТГ, Полтавський р-н, Полтавська обл., Н-31, 1.24 km from Решетилівка 38400",
        endCity: "1.24 km from Решетилівка 38400",
      }),
    ];

    const { segments: sanitized, warnings } =
      sanitizeTripSegmentsForGpsSpoofing(segments);
    expect(warnings.length).toBeGreaterThan(0);
    expect(sanitized[0].startCity).toBe("Нікополь");
    expect(sanitized[0].startCountry).toBe("UA");

    const route = classifyRoute(sanitized, 2);
    expect(route.routeKey).toBe("UA:НІКОПОЛЬ>UA:РЕШЕТИЛІВКА");
  });
});
