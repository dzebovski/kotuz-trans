import { parseValueWithUnit } from "@/utils/numbers";
import {
  extractCityFromAddress,
  extractCountryFromAddress,
} from "@/analytics/country-normalizer";
import type { WialonGeoCell, WialonStatCell } from "../types";

const DATETIME_CELL_PATTERN = /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}$/;

function isGeoCell(cell: WialonStatCell): cell is WialonGeoCell {
  return typeof cell === "object" && cell != null;
}

export function cellToString(cell: WialonStatCell): string {
  if (cell == null) {
    return "";
  }
  if (typeof cell === "string") {
    return cell;
  }
  return cell.t ?? "";
}

export type ParsedGeoCell = {
  time: string | null;
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  raw: string;
};

export function parseGeoCell(cell: WialonStatCell): ParsedGeoCell {
  if (cell == null) {
    return {
      time: null,
      latitude: null,
      longitude: null,
      address: null,
      raw: "",
    };
  }

  if (typeof cell === "string") {
    const parsed = parseCoordinateAddressCell(cell);
    return {
      time: parsed.time,
      latitude: parsed.latitude,
      longitude: parsed.longitude,
      address: parsed.address,
      raw: cell,
    };
  }

  const raw = cell.t?.trim() ?? "";
  const latitude = typeof cell.y === "number" ? cell.y : null;
  const longitude = typeof cell.x === "number" ? cell.x : null;
  const isTime = DATETIME_CELL_PATTERN.test(raw);

  return {
    time: isTime ? raw : null,
    latitude,
    longitude,
    address: !isTime && raw.includes(",") ? raw : null,
    raw,
  };
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
  if (isGeoCell(cell) && (cell.y != null || cell.x != null)) {
    const geo = parseGeoCell(cell);
    return {
      time: geo.time,
      latitude: geo.latitude,
      longitude: geo.longitude,
      address: geo.address,
      city: geo.address ? extractCityFromAddress(geo.address) : null,
      country: geo.address ? extractCountryFromAddress(geo.address) : null,
      raw: geo.raw,
    };
  }

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
