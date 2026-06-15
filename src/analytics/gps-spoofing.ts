import type { ParsedTripSegment } from "@/wialon/parsers/trips-report";
import {
  extractCityFromAddress,
  extractCountryFromAddress,
  normalizeCountryCode,
  normalizePlaceName,
} from "./country-normalizer";

export const PLAUSIBLE_FLEET_COUNTRY_CODES = new Set([
  "UA",
  "PL",
  "DE",
  "NL",
  "BE",
  "FR",
  "GB",
  "IT",
  "ES",
  "CZ",
  "SK",
  "AT",
  "HU",
  "RO",
  "LT",
  "LV",
  "EE",
  "LU",
  "CH",
  "DK",
  "SE",
  "NO",
  "FI",
  "PT",
  "IE",
  "MD",
  "BG",
  "HR",
  "SI",
]);

type SegmentEndpoint = {
  segmentIndex: number;
  isEnd: boolean;
  country: string | null;
  city: string | null;
};

function endpointCountry(segment: ParsedTripSegment, isEnd: boolean): string | null {
  const direct = normalizeCountryCode(isEnd ? segment.endCountry : segment.startCountry);
  if (direct) {
    return direct;
  }
  return extractCountryFromAddress(isEnd ? segment.endAddress : segment.startAddress);
}

function endpointCity(segment: ParsedTripSegment, isEnd: boolean): string | null {
  const address = isEnd ? segment.endAddress : segment.startAddress;
  const rawCity = isEnd ? segment.endCity : segment.startCity;
  const country = endpointCountry(segment, isEnd);
  return normalizePlaceName(rawCity ?? extractCityFromAddress(address), country);
}

function collectEndpoints(segments: ParsedTripSegment[]): SegmentEndpoint[] {
  return segments.flatMap((segment, segmentIndex) => [
    {
      segmentIndex,
      isEnd: false,
      country: endpointCountry(segment, false),
      city: endpointCity(segment, false),
    },
    {
      segmentIndex,
      isEnd: true,
      country: endpointCountry(segment, true),
      city: endpointCity(segment, true),
    },
  ]);
}

function resolveAnchorCountry(endpoints: SegmentEndpoint[]): string | null {
  const counts = new Map<string, number>();
  for (const endpoint of endpoints) {
    if (endpoint.country && PLAUSIBLE_FLEET_COUNTRY_CODES.has(endpoint.country)) {
      counts.set(endpoint.country, (counts.get(endpoint.country) ?? 0) + 1);
    }
  }
  let anchor: string | null = null;
  let max = 0;
  for (const [country, count] of counts) {
    if (count > max) {
      anchor = country;
      max = count;
    }
  }
  return max >= 2 ? anchor : null;
}

function isSpoofedCountry(country: string | null, anchorCountry: string | null): boolean {
  if (!country || !anchorCountry) {
    return false;
  }
  if (PLAUSIBLE_FLEET_COUNTRY_CODES.has(country)) {
    return false;
  }
  return true;
}

function findAnchorReplacement(
  endpoints: SegmentEndpoint[],
  anchorCountry: string,
): { country: string; city: string } | null {
  for (const endpoint of endpoints) {
    if (endpoint.country === anchorCountry && endpoint.city) {
      return { country: endpoint.country, city: endpoint.city };
    }
  }
  return null;
}

export function sanitizeTripSegmentsForGpsSpoofing(
  segments: ParsedTripSegment[],
): { segments: ParsedTripSegment[]; warnings: string[] } {
  if (segments.length === 0) {
    return { segments, warnings: [] };
  }

  const warnings: string[] = [];
  const sanitized = segments.map((segment) => ({ ...segment }));
  const endpoints = collectEndpoints(sanitized);
  const anchorCountry = resolveAnchorCountry(endpoints);
  if (!anchorCountry) {
    return { segments: sanitized, warnings };
  }

  const replacement = findAnchorReplacement(endpoints, anchorCountry);
  if (!replacement) {
    return { segments: sanitized, warnings };
  }

  for (const segment of sanitized) {
    const startCountry = endpointCountry(segment, false);
    if (isSpoofedCountry(startCountry, anchorCountry)) {
      segment.startCountry = replacement.country;
      segment.startCity = replacement.city;
      warnings.push(
        `GPS spoof corrected start (${startCountry ?? "unknown"}) -> ${replacement.city}, ${replacement.country}`,
      );
    }

    const endCountry = endpointCountry(segment, true);
    if (isSpoofedCountry(endCountry, anchorCountry)) {
      segment.endCountry = replacement.country;
      segment.endCity = replacement.city;
      warnings.push(
        `GPS spoof corrected end (${endCountry ?? "unknown"}) -> ${replacement.city}, ${replacement.country}`,
      );
    }

    if (segment.startCountry && PLAUSIBLE_FLEET_COUNTRY_CODES.has(segment.startCountry)) {
      segment.startCity =
        endpointCity(segment, false) ??
        normalizePlaceName(segment.startCity, segment.startCountry);
    }
    if (segment.endCountry && PLAUSIBLE_FLEET_COUNTRY_CODES.has(segment.endCountry)) {
      segment.endCity =
        endpointCity(segment, true) ??
        normalizePlaceName(segment.endCity, segment.endCountry);
    }
  }

  return { segments: sanitized, warnings };
}
