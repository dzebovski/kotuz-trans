import { parseValueWithUnit } from "@/utils/numbers";
import {
  extractCityFromAddress,
  extractCountryFromAddress,
} from "@/analytics/country-normalizer";
import type { WialonStatCell } from "../types";

export function cellToString(cell: WialonStatCell): string {
  if (cell == null) {
    return "";
  }
  if (typeof cell === "string") {
    return cell;
  }
  return cell.t ?? "";
}

export function parseLabeledStats(
  rows: Array<{ n?: string; c?: WialonStatCell[] }>,
): {
  values: Record<string, number | null>;
  raw: Array<{ label: string; raw: string; unit: string | null }>;
  warnings: string[];
} {
  const values: Record<string, number | null> = {};
  const raw: Array<{ label: string; raw: string; unit: string | null }> = [];
  const warnings: string[] = [];

  for (const row of rows) {
    const label = row.n?.trim();
    if (!label) {
      continue;
    }
    const cell = row.c?.[0];
    const parsed = parseValueWithUnit(cell);
    raw.push({ label, raw: parsed.raw, unit: parsed.unit });
    values[label] = parsed.value;
    if (parsed.value == null && parsed.raw) {
      warnings.push(`Unable to parse stat label "${label}"`);
    }
  }

  return { values, raw, warnings };
}

export type ParsedCoordinateAddress = {
  time: string | null;
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  city: string | null;
  country: string | null;
  raw: string;
};

export function parseCoordinateAddressCell(
  cell: WialonStatCell,
): ParsedCoordinateAddress {
  const raw = cellToString(cell);
  const lines = raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const time = lines[0] ?? null;
  let latitude: number | null = null;
  let longitude: number | null = null;
  const coordLine = lines.find((line) => line.includes("°"));
  if (coordLine) {
    const match = coordLine.match(/([\d.+-]+)°\s*([NS]),\s*([\d.+-]+)°\s*([EW])/i);
    if (match) {
      latitude =
        Number.parseFloat(match[1]) * (match[2].toUpperCase() === "S" ? -1 : 1);
      longitude =
        Number.parseFloat(match[3]) * (match[4].toUpperCase() === "W" ? -1 : 1);
    }
  }

  const addressLine =
    lines.find((line) => line.includes(",") && !line.includes("°")) ?? null;
  const address: string | null = addressLine;
  const city = addressLine ? extractCityFromAddress(addressLine) : null;
  const country = addressLine ? extractCountryFromAddress(addressLine) : null;

  return {
    time,
    latitude,
    longitude,
    address,
    city,
    country,
    raw,
  };
}

export function parseTimeCoordinateCell(cell: WialonStatCell): {
  time: string | null;
  latitude: number | null;
  longitude: number | null;
  raw: string;
} {
  const parsed = parseCoordinateAddressCell(cell);
  return {
    time: parsed.time,
    latitude: parsed.latitude,
    longitude: parsed.longitude,
    raw: parsed.raw,
  };
}
