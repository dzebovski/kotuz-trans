import "dotenv/config";
import { getServerEnv } from "../src/config/env";
import { runDailyFleetReport } from "../src/jobs/run-daily-fleet-report";
import {
  enumerateReportDates,
  getRollingReportDateRange,
} from "../src/utils/time";

function readArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const arg = process.argv.find((value) => value.startsWith(prefix));
  return arg?.slice(prefix.length);
}

function readDaysArg(): number {
  const raw = readArg("days");
  if (!raw) {
    return 30;
  }
  const days = Number(raw);
  if (!Number.isInteger(days) || days < 1) {
    throw new Error(`Invalid --days value: ${raw}`);
  }
  return days;
}

type DateResultStatus = "completed" | "skipped" | "partial" | "failed";

type DateResult = {
  reportDate: string;
  status: DateResultStatus;
  reason?: string;
  processed?: number;
  expected?: number;
  failed?: number;
};

async function main(): Promise<void> {
  const env = getServerEnv();
  const from = readArg("from");
  const to = readArg("to");
  const force = process.argv.includes("--force");
  const sendTelegram = process.argv.includes("--send-telegram");
  const stopOnError = process.argv.includes("--stop-on-error");

  let dates: string[];
  if (from || to) {
    if (!from || !to) {
      throw new Error("Both --from and --to are required when using a custom range");
    }
    dates = enumerateReportDates(from, to);
  } else {
    const range = getRollingReportDateRange(readDaysArg(), env.BUSINESS_TIMEZONE);
    dates = enumerateReportDates(range.from, range.to);
  }

  const results: DateResult[] = [];
  let shouldStop = false;

  for (const reportDate of dates) {
    if (shouldStop) {
      break;
    }

    const result = await runDailyFleetReport({
      reportDate,
      sendTelegram,
      force,
      softDeadlineMs: null,
    });

    const entry: DateResult = {
      reportDate,
      status: result.status as DateResultStatus,
      reason: result.reason,
      processed: result.summary?.processed,
      expected: result.summary?.expected,
      failed: result.summary?.failedVehicles.length,
    };
    results.push(entry);

    if (
      stopOnError &&
      (result.status === "failed" || result.status === "partial")
    ) {
      shouldStop = true;
    }
  }

  const summary = {
    from: dates[0] ?? null,
    to: dates[dates.length - 1] ?? null,
    totalDates: dates.length,
    processedDates: results.length,
    completed: results.filter((item) => item.status === "completed").length,
    skipped: results.filter((item) => item.status === "skipped").length,
    partial: results.filter((item) => item.status === "partial").length,
    failed: results.filter((item) => item.status === "failed").length,
    stoppedEarly: shouldStop,
    results,
  };

  console.log(JSON.stringify(summary, null, 2));

  if (summary.failed > 0 || (stopOnError && summary.stoppedEarly)) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "Unknown error";
  console.error(message);
  process.exitCode = 1;
});
