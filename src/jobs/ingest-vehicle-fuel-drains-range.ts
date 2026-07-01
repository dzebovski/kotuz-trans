import { getServerEnv } from "@/config/env";
import {
  upsertFuelDrainsForVehicleRange,
  type FuelEventUpsert,
} from "@/db/trips-repository";
import type { VehicleRecord } from "@/db/vehicles-repository";
import { log } from "@/utils/logger";
import {
  getBusinessDateRangeInterval,
  reportDateFromWialonLocalTime,
  wialonLocalTimeToIso,
} from "@/utils/time";
import { WialonClient } from "@/wialon/client";
import { enrichFuelEventAddresses } from "@/wialon/enrich-fuel-event-addresses";
import { parseFuelEventsFromReport } from "@/wialon/parsers/fuel-events";
import { resolveFuelEventTableIndices } from "@/wialon/parsers/fuel-report";
import { runWialonReport } from "@/wialon/report-runner";

export type IngestVehicleFuelDrainsRangeResult = {
  upserted: number;
  warnings: string[];
};

export async function ingestVehicleFuelDrainsForRange(input: {
  vehicle: VehicleRecord;
  from: string;
  to: string;
}): Promise<IngestVehicleFuelDrainsRangeResult> {
  const env = getServerEnv();
  const timezone = env.BUSINESS_TIMEZONE;
  const warnings: string[] = [];
  const client = new WialonClient();
  const interval = getBusinessDateRangeInterval(input.from, input.to, timezone);

  try {
    await client.login();

    const fuelResult = await runWialonReport(
      {
        reportResourceId: env.WIALON_REPORT_RESOURCE_ID,
        reportTemplateId: env.WIALON_FUEL_REPORT_TEMPLATE_ID,
        reportObjectId: input.vehicle.wialon_unit_id,
        reportObjectSecId: 0,
        interval: {
          flags: 0,
          from: interval.fromUnix,
          to: interval.toUnix,
        },
        remoteExec: 1,
      },
      {
        client,
        loadRows: true,
        resolveTableIndices: ({ stats, tables }) =>
          resolveFuelEventTableIndices({ stats, tables: tables ?? [] }),
      },
    );

    const parsed = parseFuelEventsFromReport({
      stats: fuelResult.stats,
      rows: fuelResult.rows,
      tables: fuelResult.tables ?? [],
    });
    warnings.push(...parsed.warnings);

    const drains = parsed.events.filter((event) => event.eventType === "drain");
    await enrichFuelEventAddresses(client, drains);
    const fuelEvents: FuelEventUpsert[] = drains.map((event) => {
      const reportDate =
        reportDateFromWialonLocalTime(event.eventTime, timezone) ?? input.from;
      return {
        vehicle_id: input.vehicle.id,
        event_type: "drain",
        event_time: wialonLocalTimeToIso(
          event.eventTime,
          timezone,
          reportDate,
        ),
        volume_l: event.volumeL,
        latitude: event.latitude,
        longitude: event.longitude,
        address: event.address,
        source_table_index: 0,
        source_row_number: event.sourceRowNumber,
        raw_event: event.rawEvent,
      };
    });

    const upserted = await upsertFuelDrainsForVehicleRange({
      vehicleId: input.vehicle.id,
      from: input.from,
      to: input.to,
      timezone,
      events: fuelEvents,
    });
    warnings.push(...upserted.warnings);

    log("info", "vehicle_range_drains_synced", {
      vehicleId: input.vehicle.id,
      from: input.from,
      to: input.to,
      upserted: upserted.upserted,
      parsed: drains.length,
    });

    return {
      upserted: upserted.upserted,
      warnings,
    };
  } finally {
    await client.logout();
  }
}
