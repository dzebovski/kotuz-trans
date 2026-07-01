import { BUSINESS_TIMEZONE } from "@/lib/report/dates";
import type { EnsureRangeResponse, EnsureSkipReason } from "@/lib/report/types";

export function formatNum(value: number | null, suffix = ""): string {
  if (value == null || Number.isNaN(value)) {
    return "—";
  }
  return `${value.toLocaleString("uk-UA", { maximumFractionDigits: 2 })}${suffix}`;
}

export function formatDuration(seconds: number | null): string {
  if (seconds == null || seconds <= 0) {
    return "—";
  }
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours} год ${minutes} хв`;
}

export function formatDate(date: string): string {
  const [year, month, day] = date.split("-");
  return `${day}.${month}.${year}`;
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("uk-UA", {
    timeZone: BUSINESS_TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatCoordinates(
  latitude: number,
  longitude: number,
): string {
  const latHemisphere = latitude >= 0 ? "N" : "S";
  const lonHemisphere = longitude >= 0 ? "E" : "W";
  return `${Math.abs(latitude).toFixed(6)}° ${latHemisphere}, ${Math.abs(longitude).toFixed(6)}° ${lonHemisphere}`;
}

export function formatFuelEventLocation(
  address: string | null,
  latitude: number | null,
  longitude: number | null,
): string {
  if (address?.trim()) {
    return address.trim();
  }
  if (latitude != null && longitude != null) {
    return formatCoordinates(latitude, longitude);
  }
  return "—";
}

export function coverageLabel(
  state:
    | "ready"
    | "provisional"
    | "missing"
    | "queued"
    | "running"
    | "partial"
    | "failed",
): string {
  const labels = {
    ready: "готово",
    provisional: "попередні",
    missing: "немає даних",
    queued: "у черзі",
    running: "завантаження",
    partial: "частково",
    failed: "помилка",
  } as const;
  return labels[state];
}

export function buildEnsureRunStatusMessage(
  result: Pick<EnsureRangeResponse, "queued" | "skipped">,
): string {
  if (result.queued.length > 0) {
    return `У черзі ${result.queued.length} дат. Запускаю обробку…`;
  }
  if (result.skipped.length === 0) {
    return "Черга вже заповнена. Продовжую обробку…";
  }
  if (result.skipped.every((item) => item.reason === "already_final")) {
    return "Дані вже завантажені. Оновлюю звіт…";
  }
  if (
    result.skipped.every((item) => item.reason === "already_queued_or_running")
  ) {
    return "Дати вже в черзі або обробляються. Оновлюю статус…";
  }
  if (
    result.skipped.every((item) => item.reason === "queue_failed_needs_retry")
  ) {
    return "Є дати з помилкою. Спробуйте «Довантажити дані» або повтор…";
  }
  return "Нові дати не додано. Оновлюю звіт…";
}

export function ensureSkipReasonLabel(reason: EnsureSkipReason): string {
  const labels: Record<EnsureSkipReason, string> = {
    already_final: "дані вже завантажені",
    already_queued_or_running: "вже в черзі або обробляється",
    queue_failed_needs_retry: "потрібен повтор після помилки",
  };
  return labels[reason];
}

export async function readJsonResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  let json: (T & { error?: string }) | null = null;
  try {
    json = JSON.parse(text) as T & { error?: string };
  } catch {
    throw new Error(`API повернув невалідну відповідь (${response.status})`);
  }
  if (!response.ok) {
    throw new Error(json.error ?? `Запит не виконано (${response.status})`);
  }
  return json;
}
