import { BUSINESS_TIMEZONE } from "@/lib/report/dates";

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
