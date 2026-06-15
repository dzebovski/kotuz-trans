export type LogLevel = "debug" | "info" | "warn" | "error";

const FORBIDDEN_KEYS = new Set([
  "token",
  "sid",
  "authorization",
  "cookie",
  "supabase_service_role_key",
  "telegram_bot_token",
  "cron_secret",
  "wialon_token",
]);

function sanitizeValue(key: string, value: unknown): unknown {
  if (FORBIDDEN_KEYS.has(key.toLowerCase())) {
    return "[redacted]";
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return sanitizeObject(value as Record<string, unknown>);
  }
  return value;
}

function sanitizeObject(input: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    output[key] = sanitizeValue(key, value);
  }
  return output;
}

export function log(
  level: LogLevel,
  event: string,
  fields: Record<string, unknown> = {},
): void {
  const payload = {
    level,
    event,
    ...sanitizeObject(fields),
    timestamp: new Date().toISOString(),
  };
  const line = JSON.stringify(payload);
  if (level === "error") {
    console.error(line);
    return;
  }
  if (level === "warn") {
    console.warn(line);
    return;
  }
  console.log(line);
}
