const COUNTRY_ALIASES: Record<string, string> = {
  ukraine: "UA",
  ukraina: "UA",
  "україна": "UA",
  "украина": "UA",
  poland: "PL",
  germany: "DE",
  netherlands: "NL",
  belgium: "BE",
  france: "FR",
  "united kingdom": "GB",
  uk: "GB",
  england: "GB",
  italy: "IT",
  spain: "ES",
  czechia: "CZ",
  "czech republic": "CZ",
  slovakia: "SK",
  austria: "AT",
  hungary: "HU",
  romania: "RO",
  lithuania: "LT",
  latvia: "LV",
  estonia: "EE",
  peru: "PE",
};

export function slugifyCity(city: string): string {
  return city
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9\u0400-\u04FF]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function normalizeCountryCode(input: string | null | undefined): string | null {
  if (!input) {
    return null;
  }
  const trimmed = input.trim();
  if (/^[A-Z]{2}$/i.test(trimmed)) {
    const code = trimmed.toUpperCase();
    if (code === "UK") {
      return "GB";
    }
    return code;
  }
  const alias = COUNTRY_ALIASES[trimmed.toLowerCase()];
  return alias ?? null;
}

export function extractCountryFromAddress(address: string | null): string | null {
  if (!address) {
    return null;
  }
  const parts = address.split(",").map((part) => part.trim());
  for (const part of parts) {
    const code = normalizeCountryCode(part);
    if (code) {
      return code;
    }
  }
  return null;
}

export function extractCityFromAddress(address: string | null): string | null {
  if (!address) {
    return null;
  }
  const parts = address.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) {
    return null;
  }
  if (parts.length === 1) {
    return parts[0];
  }

  const countryIndexes = parts
    .map((part, index) => (normalizeCountryCode(part) ? index : -1))
    .filter((index) => index >= 0);

  if (countryIndexes.length === 1 && countryIndexes[0] > 0) {
    return parts[0];
  }

  if (countryIndexes.length >= 1 && countryIndexes[0] === 0) {
    const countryCode = normalizeCountryCode(parts[0]);
    for (let index = parts.length - 1; index > 0; index -= 1) {
      const part = parts[index];
      if (isSkippableAddressPart(part, countryCode)) {
        continue;
      }
      if (normalizePlaceName(part, countryCode)) {
        return part;
      }
    }
  }

  return parts[0];
}

function isSkippableAddressPart(
  part: string,
  countryCode: string | null,
): boolean {
  if (normalizeCountryCode(part)) {
    return true;
  }
  if (/^[A-Za-zА-Яа-яІіЇїЄєҐґ]-\d+/.test(part)) {
    return true;
  }
  if (/^A\d+$/i.test(part)) {
    return true;
  }
  if (/^O-\d+/i.test(part)) {
    return true;
  }
  if (/^\d+([.,]\d+)?$/.test(part)) {
    return true;
  }
  if (part.length < 2) {
    return true;
  }
  if (countryCode === "UA" && /(обл|р-н)\.?$/i.test(part)) {
    return true;
  }
  return false;
}

export function normalizePlaceName(
  value: string | null | undefined,
  countryCode?: string | null,
): string | null {
  if (!value) {
    return null;
  }

  let text = value.trim();
  if (!text) {
    return null;
  }

  const kmFromMatch = text.match(/(?:\d+([.,]\d+)?\s*km\s+from|from|від)\s+(.+)$/i);
  if (kmFromMatch) {
    text = kmFromMatch[2].trim();
  }

  if (/^\d+([.,]\d+)?\s*km\b/i.test(text)) {
    return null;
  }

  const postalSuffix = text.match(/^(.+?)\s+\d{4,5}$/u);
  if (postalSuffix) {
    text = postalSuffix[1].trim();
  }

  if (/^\d{4,5}$/.test(text)) {
    return null;
  }

  if (/^A\d+$/i.test(text)) {
    return null;
  }

  if (/^\d+([.,]\d+)?$/.test(text)) {
    return null;
  }

  if (countryCode === "UA" && /обл\.?$/i.test(text)) {
    return null;
  }

  return text || null;
}
