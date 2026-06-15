import { z } from "zod";

const optionalPositiveInt = z.coerce.number().int().positive().optional();

const serverEnvSchema = z.object({
  WIALON_API_URL: z.string().url(),
  WIALON_TOKEN: z.string().min(1),
  WIALON_OPERATE_AS: z.string().optional(),
  WIALON_USER: z.string().optional(),
  WIALON_REPORT_RESOURCE_ID: z.coerce.number().int().positive(),
  WIALON_FUEL_REPORT_TEMPLATE_ID: z.coerce.number().int().positive(),
  WIALON_TRIPS_REPORT_TEMPLATE_ID: z.coerce.number().int().positive(),
  WIALON_GEOFENCES_REPORT_TEMPLATE_ID: z.coerce
    .number()
    .int()
    .positive()
    .default(1),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  TELEGRAM_CHAT_ID: z.string().min(1),
  TELEGRAM_THREAD_ID: z.string().optional(),
  CRON_SECRET: z.string().optional(),
  BUSINESS_TIMEZONE: z.string().min(1).default("Europe/Kyiv"),
  WIALON_CONCURRENCY: z.coerce.number().int().positive().default(2),
  WIALON_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),
  WIALON_REPORT_TIMEOUT_MS: z.coerce.number().int().positive().default(180000),
  WIALON_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(1500),
  BASELINE_LOOKBACK_DAYS: z.coerce.number().int().positive().default(120),
  BASELINE_MIN_SAMPLES: z.coerce.number().int().positive().default(5),
  BASELINE_HIGHWAY_TOLERANCE: z.coerce.number().positive().default(0.1),
  ANOMALY_WARNING_PERCENT: z.coerce.number().positive().default(15),
  ANOMALY_CRITICAL_PERCENT: z.coerce.number().positive().default(25),
  LOCAL_MANEUVER_MAX_KM: z.coerce.number().positive().default(2),
  JOB_SOFT_DEADLINE_MS: optionalPositiveInt,
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cachedEnv: ServerEnv | null = null;

export function getServerEnv(): ServerEnv {
  if (cachedEnv) {
    return cachedEnv;
  }

  const parsed = serverEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid environment configuration: ${issues}`);
  }

  cachedEnv = parsed.data;
  return cachedEnv;
}

export function requireCronSecret(): string {
  const secret = getServerEnv().CRON_SECRET;
  if (!secret) {
    throw new Error("CRON_SECRET is required for cron route");
  }
  return secret;
}

export function getWialonOperateAs(env = getServerEnv()): string | undefined {
  return env.WIALON_OPERATE_AS;
}

const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;

let cachedPublicEnv: PublicEnv | null = null;

function pickFirstEnv(...values: Array<string | undefined>): string | undefined {
  return values.find((value) => value != null && value.trim().length > 0);
}

function resolvePublicEnvInput() {
  return {
    NEXT_PUBLIC_SUPABASE_URL: pickFirstEnv(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_URL,
    ),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: pickFirstEnv(
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      process.env.SUPABASE_PUBLISHABLE_KEY,
      process.env.SUPABASE_ANON_KEY,
    ),
  };
}

export function getPublicEnv(): PublicEnv {
  if (cachedPublicEnv) {
    return cachedPublicEnv;
  }

  const parsed = publicEnvSchema.safeParse(resolvePublicEnvInput());
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid public environment configuration: ${issues}`);
  }

  cachedPublicEnv = parsed.data;
  return cachedPublicEnv;
}
