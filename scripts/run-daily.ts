import "dotenv/config";
import { runDailyFleetReport } from "../src/jobs/run-daily-fleet-report";

function readArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const arg = process.argv.find((value) => value.startsWith(prefix));
  return arg?.slice(prefix.length);
}

async function main(): Promise<void> {
  const reportDate = readArg("date");
  const sendTelegram = process.argv.includes("--send-telegram");
  const force = process.argv.includes("--force");

  const result = await runDailyFleetReport({
    reportDate,
    sendTelegram,
    force,
    softDeadlineMs: null,
  });

  console.log(
    JSON.stringify({
      status: result.status,
      reportDate: result.reportDate,
      reason: result.reason,
      processed: result.summary?.processed,
      expected: result.summary?.expected,
      failed: result.summary?.failedVehicles.length,
    }),
  );

  if (result.status === "failed") {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "Unknown error";
  console.error(message);
  process.exitCode = 1;
});
