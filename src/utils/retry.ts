import { sleep } from "./timeout";

export type RetryOptions = {
  maxRetries?: number;
  baseDelayMs?: number;
  shouldRetry?: (error: unknown) => boolean;
};

const DEFAULT_RETRYABLE_STATUS = new Set([429, 502, 503, 504]);

export function isRetryableHttpStatus(status: number): boolean {
  return DEFAULT_RETRYABLE_STATUS.has(status);
}

export function isNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return (
    error.name === "AbortError" ||
    error.message.includes("fetch failed") ||
    error.message.includes("network")
  );
}

export async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const maxRetries = options.maxRetries ?? 2;
  const baseDelayMs = options.baseDelayMs ?? 500;
  const shouldRetry = options.shouldRetry ?? ((error: unknown) => isNetworkError(error));

  let attempt = 0;
  while (true) {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= maxRetries || !shouldRetry(error)) {
        throw error;
      }
      const jitter = Math.floor(Math.random() * 100);
      const delay = baseDelayMs * 2 ** attempt + jitter;
      await sleep(delay);
      attempt += 1;
    }
  }
}
