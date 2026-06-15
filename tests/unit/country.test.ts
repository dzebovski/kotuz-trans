import { describe, expect, it } from "vitest";
import {
  extractCityFromAddress,
  extractCountryFromAddress,
  normalizeCountryCode,
} from "@/analytics/country-normalizer";

describe("country-normalizer", () => {
  it("normalizes common country names", () => {
    expect(normalizeCountryCode("Netherlands")).toBe("NL");
    expect(normalizeCountryCode("United Kingdom")).toBe("GB");
    expect(normalizeCountryCode("Czech Republic")).toBe("CZ");
  });

  it("extracts country from Wialon address with country first", () => {
    expect(
      extractCountryFromAddress(
        "Poland, Strzelecki powiat, województwo opolskie, A4, Czarnocin",
      ),
    ).toBe("PL");
  });

  it("extracts country from Wialon address with country in the middle", () => {
    expect(
      extractCountryFromAddress(
        "7587GA de Lutte, Netherlands, Overijssel, A1",
      ),
    ).toBe("NL");
    expect(
      extractCountryFromAddress(
        "8400 Oostende, Belgium, West-Vlaanderen, Heerweg",
      ),
    ).toBe("BE");
  });

  it("extracts city from common Wialon address formats", () => {
    expect(extractCityFromAddress("De Lutte, Netherlands")).toBe("De Lutte");
    expect(
      extractCityFromAddress(
        "7587GA de Lutte, Netherlands, Overijssel, A1",
      ),
    ).toBe("7587GA de Lutte");
    expect(
      extractCityFromAddress(
        "Poland, Strzelecki powiat, województwo opolskie, A4, Czarnocin",
      ),
    ).toBe("Czarnocin");
  });

  it("extracts country from Ukrainian Wialon addresses", () => {
    expect(
      extractCountryFromAddress(
        "Україна, Дмитрівська ТГ, Кропивницький р-н, Кіровоградська обл., М-30",
      ),
    ).toBe("UA");
    expect(
      extractCountryFromAddress(
        "Калинівка 08623, Україна, Фастівський р-н, Київська обл., О-100720",
      ),
    ).toBe("UA");
  });
});
