import type { ParsedTripSegment } from "@/wialon/parsers/trips-report";
import {
  extractCityFromAddress,
  extractCountryFromAddress,
  normalizeCountryCode,
  normalizePlaceName,
  slugifyCity,
} from "./country-normalizer";

export type RouteClassification = {
  routeKey: string | null;
  routeTag: string;
  startCountryCode: string | null;
  startCity: string | null;
  startAddress: string | null;
  endCountryCode: string | null;
  endCity: string | null;
  endAddress: string | null;
  countriesVisited: string[];
  segments: Array<ParsedTripSegment & { isLocalManeuver: boolean }>;
};

export function markLocalManeuvers(
  segments: ParsedTripSegment[],
  localManeuverMaxKm: number,
): Array<ParsedTripSegment & { isLocalManeuver: boolean }> {
  return segments.map((segment) => ({
    ...segment,
    isLocalManeuver:
      segment.mileageKm != null && segment.mileageKm < localManeuverMaxKm,
  }));
}

function resolveCountry(segment: ParsedTripSegment, end = false): string | null {
  const direct = end
    ? normalizeCountryCode(segment.endCountry)
    : normalizeCountryCode(segment.startCountry);
  if (direct) {
    return direct;
  }
  const address = end ? segment.endAddress : segment.startAddress;
  return extractCountryFromAddress(address);
}

function resolveCity(segment: ParsedTripSegment, end = false): string | null {
  const country = resolveCountry(segment, end);
  const address = end ? segment.endAddress : segment.startAddress;
  const rawCity = end ? segment.endCity : segment.startCity;
  return normalizePlaceName(rawCity ?? extractCityFromAddress(address), country);
}

export function buildRouteTag(countries: string[]): string {
  const unique = [...new Set(countries.filter(Boolean))];
  if (unique.length === 0) {
    return "UNKNOWN";
  }
  if (unique.length === 1) {
    return `${unique[0]}_INTERNAL`;
  }
  if (unique.includes("GB") && unique.some((code) => code !== "GB")) {
    return "UK_EU_INTERNATIONAL";
  }
  if (unique.includes("UA") && unique.some((code) => code !== "UA")) {
    return "UA_INTERNATIONAL";
  }
  return "EU_INTERNATIONAL";
}

export function classifyRoute(
  segments: ParsedTripSegment[],
  localManeuverMaxKm: number,
): RouteClassification {
  const marked = markLocalManeuvers(segments, localManeuverMaxKm);
  const routeSegments =
    marked.filter((segment) => !segment.isLocalManeuver).length > 0
      ? marked.filter((segment) => !segment.isLocalManeuver)
      : marked;

  const startSegment = routeSegments[0] ?? null;
  const endSegment = routeSegments[routeSegments.length - 1] ?? null;

  const startCountryCode = startSegment ? resolveCountry(startSegment, false) : null;
  const endCountryCode = endSegment ? resolveCountry(endSegment, true) : null;
  const startCity = startSegment ? resolveCity(startSegment, false) : null;
  const endCity = endSegment ? resolveCity(endSegment, true) : null;

  const countriesVisited = [
    ...new Set(
      marked
        .flatMap((segment) => [
          resolveCountry(segment, false),
          resolveCountry(segment, true),
        ])
        .filter((code): code is string => Boolean(code)),
    ),
  ];

  const routeTag = buildRouteTag(countriesVisited);
  const routeKey =
    startCountryCode && endCountryCode && startCity && endCity
      ? `${startCountryCode}:${slugifyCity(startCity)}>${endCountryCode}:${slugifyCity(endCity)}`
      : null;

  return {
    routeKey,
    routeTag,
    startCountryCode,
    startCity,
    startAddress: startSegment?.startAddress ?? null,
    endCountryCode,
    endCity,
    endAddress: endSegment?.endAddress ?? null,
    countriesVisited,
    segments: marked,
  };
}
