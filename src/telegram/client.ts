import { getServerEnv } from "@/config/env";
import type { FleetSummary } from "@/analytics/fleet-summary";
import { withRetry, isRetryableHttpStatus } from "@/utils/retry";
import { sleep } from "@/utils/timeout";
import { formatFleetReport } from "./formatter";

export async function sendFleetReport(summary: FleetSummary): Promise<void> {
  const messages = formatFleetReport(summary);

  for (const text of messages) {
    await sendTelegramMessage(text);
  }
}

async function sendTelegramMessage(text: string): Promise<void> {
  const env = getServerEnv();
  const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;
  const payload: Record<string, unknown> = {
    chat_id: env.TELEGRAM_CHAT_ID,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
  };
  if (env.TELEGRAM_THREAD_ID) {
    payload.message_thread_id = env.TELEGRAM_THREAD_ID;
  }

  await withRetry(
    async () => {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (response.status === 429) {
        const body = (await response.json()) as {
          parameters?: { retry_after?: number };
        };
        const retryAfter = body.parameters?.retry_after ?? 1;
        await sleep(retryAfter * 1000);
        throw new Error("Retry after 429");
      }
      if (!response.ok) {
        if (isRetryableHttpStatus(response.status)) {
          throw new Error(`Telegram HTTP ${response.status}`);
        }
        const body = await response.text();
        throw new Error(`Telegram error ${response.status}: ${body.slice(0, 200)}`);
      }
    },
    {
      maxRetries: 2,
      shouldRetry: (error) =>
        error instanceof Error &&
        (error.message.includes("429") ||
          error.message.includes("502") ||
          error.message.includes("503") ||
          error.message.includes("504") ||
          error.message.includes("Retry after")),
    },
  );
}
