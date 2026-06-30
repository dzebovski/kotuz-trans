"use client";

import { useId, useMemo, useState } from "react";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type Header,
  type SortingState,
} from "@tanstack/react-table";
import {
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Clock3,
  Fuel,
  Route,
} from "lucide-react";
import { Badge } from "@/components/Badge";
import {
  getHeaderAriaSort,
  SortableHeaderButton,
} from "@/components/table/SortableHeaderButton";
import { formatDuration, formatNum, formatTime } from "@/lib/report/format";
import { vehicleSegmentColumns } from "@/lib/report/table-columns";
import type { VehicleTripSegment } from "@/lib/report/types";
import { buildVehicleSegmentsSummary } from "@/lib/report/vehicle-segments-summary";

type VehicleSegmentsTableProps = {
  segments: VehicleTripSegment[];
};

type VehicleSegmentsReportProps = VehicleSegmentsTableProps & {
  mileageKm: number;
  fuelConsumedL: number;
  movementDurationSeconds: number;
};

function formatAddress(address: string | null): string {
  return address?.trim() ? address : "—";
}

function formatUkrainianCount(
  value: number,
  forms: [one: string, few: string, many: string],
): string {
  const lastTwoDigits = value % 100;
  const lastDigit = value % 10;
  const form =
    lastTwoDigits >= 11 && lastTwoDigits <= 14
      ? forms[2]
      : lastDigit === 1
        ? forms[0]
        : lastDigit >= 2 && lastDigit <= 4
          ? forms[1]
          : forms[2];

  return `${value} ${form}`;
}

function SummaryMetric({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="vehicle-segments-summary__metric">
      <span aria-hidden>{icon}</span>
      <div>
        <dt>{label}</dt>
        <dd className="mono">{value}</dd>
      </div>
    </div>
  );
}

function VehicleSegmentsHeaderCell({
  header,
}: {
  header: Header<VehicleTripSegment, unknown>;
}) {
  const sortDirection = header.column.getIsSorted();

  return (
    <th aria-sort={header.column.getCanSort() ? getHeaderAriaSort(sortDirection) : undefined}>
      {header.column.getCanSort() ? (
        <SortableHeaderButton
          header={header}
          className="trip-segments-table__sort-btn"
          activeClassName="trip-segments-table__sort-btn--active"
        />
      ) : header.isPlaceholder ? null : (
        flexRender(header.column.columnDef.header, header.getContext())
      )}
    </th>
  );
}

export function VehicleSegmentsTable({ segments }: VehicleSegmentsTableProps) {
  const [sorting, setSorting] = useState<SortingState>([
    { id: "startedAt", desc: false },
  ]);
  const table = useReactTable({
    data: segments,
    columns: vehicleSegmentColumns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: (segment) => segment.id,
  });

  return (
    <div className="table-scroll">
      <table className="trip-segments-table vehicle-segments-table">
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <VehicleSegmentsHeaderCell key={header.id} header={header} />
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => {
            const segment = row.original;
            return (
              <tr key={row.id}>
                <td className="mono">{formatTime(segment.startedAt)}</td>
                <td>
                  <span className="mono">{formatTime(segment.endedAt)}</span>
                  <small>{formatDuration(segment.durationSeconds)}</small>
                </td>
                <td>{formatAddress(segment.startAddress)}</td>
                <td>{formatAddress(segment.endAddress)}</td>
                <td className="mono">{formatNum(segment.mileageKm, " km")}</td>
                <td className="mono">{formatNum(segment.fuelConsumedL, " l")}</td>
                <td className="mono">
                  {formatNum(segment.averageFuelConsumptionLPer100Km, " l/100")}
                </td>
                <td className="mono">
                  {formatNum(segment.averageSpeedKmh, " km/h")}
                  <small>max {formatNum(segment.maxSpeedKmh, " km/h")}</small>
                </td>
                <td>{segment.isLocalManeuver ? <Badge>local</Badge> : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function VehicleSegmentsReport({
  segments,
  mileageKm,
  fuelConsumedL,
  movementDurationSeconds,
}: VehicleSegmentsReportProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const detailsId = useId();
  const summary = useMemo(() => buildVehicleSegmentsSummary(segments), [segments]);

  if (!summary) {
    return null;
  }

  return (
    <div className="panel table-shell vehicle-detail-table-shell vehicle-segments-report">
      <div className="vehicle-segments-summary">
        <div className="vehicle-segments-summary__route">
          <div className="vehicle-segments-summary__route-heading">
            <span className="vehicle-segments-summary__route-icon" aria-hidden>
              <Route size={17} />
            </span>
            <div>
              <span>Маршрут за період</span>
              <small className="mono">
                {formatTime(summary.firstStartedAt)} — {formatTime(summary.lastEndedAt)}
              </small>
            </div>
          </div>
          <div className="vehicle-segments-summary__route-grid">
            <div>
              <small>Звідки</small>
              <strong>{formatAddress(summary.startAddress)}</strong>
            </div>
            <ArrowRight size={17} aria-hidden />
            <div>
              <small>Куди</small>
              <strong>{formatAddress(summary.endAddress)}</strong>
            </div>
          </div>
          <p>
            {formatUkrainianCount(summary.segmentCount, [
              "сегмент",
              "сегменти",
              "сегментів",
            ])}
            {" · "}
            {formatUkrainianCount(summary.movementDayCount, ["день", "дні", "днів"])}
            {" руху"}
          </p>
        </div>

        <dl className="vehicle-segments-summary__metrics">
          <SummaryMetric
            icon={<Route size={15} />}
            label="Пробіг"
            value={formatNum(mileageKm, " km")}
          />
          <SummaryMetric
            icon={<Clock3 size={15} />}
            label="Час руху"
            value={formatDuration(movementDurationSeconds)}
          />
          <SummaryMetric
            icon={<Fuel size={15} />}
            label="Паливо"
            value={formatNum(fuelConsumedL, " l")}
          />
        </dl>

        <button
          className="button vehicle-segments-summary__toggle"
          type="button"
          aria-expanded={isExpanded}
          aria-controls={detailsId}
          onClick={() => setIsExpanded((expanded) => !expanded)}
        >
          {isExpanded
            ? "Згорнути таблицю"
            : `Показати ${formatUkrainianCount(summary.segmentCount, [
                "сегмент",
                "сегменти",
                "сегментів",
              ])}`}
          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>

      {isExpanded ? (
        <div className="vehicle-segments-report__details" id={detailsId}>
          <VehicleSegmentsTable segments={segments} />
        </div>
      ) : null}
    </div>
  );
}
