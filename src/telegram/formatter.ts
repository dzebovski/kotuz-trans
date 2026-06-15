import { getServerEnv } from "@/config/env";
import { escapeHtml, chunkText } from "@/utils/html";
import type { FleetSummary, FleetVehicleSummary } from "@/analytics/fleet-summary";
import { formatTimeRange } from "@/analytics/vehicle-day-window";

function formatNumber(value: number, digits = 2): string {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}

function formatNullableNumber(value: number | null, suffix = ""): string {
  if (value == null || Number.isNaN(value)) {
    return "—";
  }
  return `${formatNumber(value)}${suffix}`;
}

function anomalyMarker(status: string): string {
  if (status === "critical") {
    return " 🔴";
  }
  if (status === "warning") {
    return " ⚠️";
  }
  return "";
}

function formatVehicleBlock(
  vehicle: FleetVehicleSummary,
  timezone: string,
): string[] {
  const lines: string[] = [];
  lines.push(
    `<b>${escapeHtml(vehicle.displayName)}</b>${anomalyMarker(vehicle.anomalyStatus)}`,
  );
  lines.push(
    `Маршрут: ${vehicle.routeKey ? escapeHtml(vehicle.routeKey) : "—"}`,
  );
  const timeRange = formatTimeRange(
    vehicle.firstTripAt,
    vehicle.lastTripAt,
    timezone,
  );
  lines.push(`Час: ${timeRange ?? "—"}`);
  lines.push(`Пробіг: ${formatNumber(vehicle.mileageKm, 0)} km`);
  lines.push(`Паливо: ${formatNullableNumber(vehicle.fuelConsumedL, " l")}`);
  lines.push(
    `Середній розхід: ${formatNullableNumber(vehicle.averageFuelConsumptionLPer100Km, " l/100 km")}`,
  );
  return lines;
}

export function formatFleetReport(summary: FleetSummary): string[] {
  let timezone = "Europe/Kyiv";
  try {
    timezone = getServerEnv().BUSINESS_TIMEZONE;
  } catch {
    // Unit tests may format without full env.
  }
  const lines: string[] = [];

  lines.push(`<b>Звіт флоту — ${escapeHtml(summary.reportDate)}</b>`);
  lines.push("");
  lines.push("<b>Підсумок</b>");
  lines.push(`Оброблено: ${summary.processed}/${summary.expected}`);
  lines.push(`Пробіг: ${formatNumber(summary.totalMileageKm, 0)} km`);
  lines.push(`Паливо: ${formatNumber(summary.totalFuelConsumedL, 0)} l`);
  if (summary.averageConsumptionLPer100Km != null) {
    lines.push(
      `Середній розхід: ${formatNumber(summary.averageConsumptionLPer100Km)} l/100 km`,
    );
  }
  lines.push(
    `Заправки: ${summary.refillCount} / ${formatNumber(summary.refilledL, 0)} l`,
  );
  lines.push(`Зливи: ${summary.drainCount}`);

  const vehicles = [...summary.vehicles].sort((a, b) =>
    a.displayName.localeCompare(b.displayName, "uk"),
  );
  if (vehicles.length > 0) {
    lines.push("");
    lines.push("<b>Автомобілі</b>");
    for (const vehicle of vehicles) {
      lines.push("");
      lines.push(...formatVehicleBlock(vehicle, timezone));
    }
  }

  if (summary.failedVehicles.length > 0) {
    lines.push("");
    lines.push("<b>Помилки обробки</b>");
    summary.failedVehicles.forEach((failure, index) => {
      lines.push(
        `${index + 1}. unit ${failure.wialonUnitId} — ${escapeHtml(failure.reason)}`,
      );
    });
  }

  return chunkText(lines.join("\n"));
}
