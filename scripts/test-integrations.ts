import "dotenv/config";
import { getServerEnv } from "../src/config/env";
import { getSupabaseAdmin } from "../src/db/supabase-admin";
import { listActiveVehicles } from "../src/db/vehicles-repository";
import { WialonClient } from "../src/wialon/client";
import { WialonError } from "../src/wialon/errors";

async function main(): Promise<void> {
  const env = getServerEnv();

  const supabase = getSupabaseAdmin();
  const { error: supabaseError } = await supabase
    .from("vehicles")
    .select("id", { count: "exact", head: true });
  if (supabaseError) {
    throw new Error(`Supabase check failed: ${supabaseError.message}`);
  }

  const vehicles = await listActiveVehicles();
  const probeUnitId = vehicles.find((v) => v.wialon_unit_id === 6221)?.wialon_unit_id
    ?? vehicles[0]?.wialon_unit_id
    ?? 6221;

  const client = new WialonClient();
  const session = await client.login();

  try {
    await client.call("core/search_item", { id: probeUnitId, flags: 1 });
  } catch (error) {
    if (error instanceof WialonError && error.code === 7) {
      throw new Error(
        `Wialon user "${session.userName ?? "unknown"}" can login but has no access to unit ${probeUnitId}. ` +
          "Check token ACL: units (avl_unit) + reports on resource " +
          `${env.WIALON_REPORT_RESOURCE_ID}.`,
      );
    }
    throw error;
  } finally {
    await client.logout();
  }

  console.log(
    JSON.stringify({
      status: "ok",
      supabase: true,
      wialon: true,
      wialonUser: session.userName,
      wialonUserId: session.userId,
      wialonUnitAccess: probeUnitId,
      businessTimezone: env.BUSINESS_TIMEZONE,
    }),
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "Unknown error";
  console.error(message);
  process.exitCode = 1;
});
