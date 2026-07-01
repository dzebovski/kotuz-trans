"use client";

import Link from "next/link";
import {
  AlertTriangle,
  ChevronRight,
  Clock3,
  Droplets,
  Fuel,
  Gauge,
  Truck,
} from "lucide-react";
import { Badge } from "@/components/Badge";
import {
  formatFuelStatusBadgeLabel,
  formatHighDaysBadgeLabel,
  fuelStatusBadgeTone,
} from "@/analytics/fuel-consumption-status";
import { formatDuration, formatNum } from "@/lib/report/format";
import type { RangeVehicle } from "@/lib/report/types";
import { formatRouteFlags } from "@/utils/route-flags";

type RangeVehicleRowProps = {
  vehicle: RangeVehicle;
  from: string;
  to: string;
};

export function RangeVehicleRow({ vehicle, from, to }: RangeVehicleRowProps) {
  const fuelBadgeLabel = formatFuelStatusBadgeLabel(
    vehicle.fuelStatus,
    vehicle.consumptionLPer100Km,
  );

  return (
    <article className="vehicle-card range-fleet-table__row">
      <div className="range-fleet-grid">
        <div className="vehicle-cell">
          <div className="vehicle-name">
            <Truck size={15} />
            {vehicle.vehicle.displayName}
          </div>
          <div className="vehicle-meta mono">unit {vehicle.vehicle.wialonUnitId}</div>
        </div>
        <div className="route-flags range-fleet-grid__metric" title={formatRouteFlags(vehicle.days)}>
          {formatRouteFlags(vehicle.days)}
        </div>
        <div className="range-fleet-grid__metric mono">{formatNum(vehicle.mileageKm, " km")}</div>
        <div className="range-fleet-grid__metric mono">{formatNum(vehicle.fuelConsumedL, " l")}</div>
        <div className="range-fleet-grid__metric mono">
          {formatNum(vehicle.consumptionLPer100Km, " l/100")}
        </div>
        <div className="range-fleet-grid__metric mono">
          {formatNum(vehicle.rolling1000KmConsumptionLPer100Km, " l/100")}
        </div>
        <div className="range-fleet-grid__metric mono">
          {formatDuration(vehicle.movementDurationSeconds)}
        </div>
        <div className="range-fleet-grid__action">
          <Link
            href={`/vehicles/${vehicle.vehicle.id}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`}
            className="button button--ghost"
          >
            Детально
            <ChevronRight size={16} />
          </Link>
        </div>
      </div>
      <div className="chip-row vehicle-statuses">
        {fuelBadgeLabel ? (
          <Badge tone={fuelStatusBadgeTone(vehicle.fuelStatus ?? "")}>
            <AlertTriangle size={13} />
            {fuelBadgeLabel}
          </Badge>
        ) : null}
        {vehicle.highDays > 0 ? (
          <Badge tone="danger">
            <AlertTriangle size={13} />
            {formatHighDaysBadgeLabel(vehicle.highDays)}
          </Badge>
        ) : null}
        <Badge>
          <Fuel size={13} />
          Заправок: {vehicle.refillCount} · {formatNum(vehicle.refilledL, "л")}
        </Badge>
        {vehicle.drainCount > 0 ? (
          <Badge tone="danger">
            <Droplets size={13} />
            Зливів: {vehicle.drainCount} · {formatNum(vehicle.drainedL, "л")}
          </Badge>
        ) : null}
        <Badge>
          <Clock3 size={13} />
          стоянки {vehicle.parkingCount} · {formatDuration(vehicle.parkingDurationSeconds)}
        </Badge>
        {vehicle.overSpeedLimitDurationSeconds > 0 ? (
          <Badge tone="warning">
            <Gauge size={13} />
            &gt; 86 км/г · {formatDuration(vehicle.overSpeedLimitDurationSeconds)}
          </Badge>
        ) : null}
      </div>
    </article>
  );
}
