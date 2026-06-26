"use client";

import { useState } from "react";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type Header,
  type SortingState,
} from "@tanstack/react-table";
import { Badge } from "@/components/Badge";
import {
  getHeaderAriaSort,
  SortableHeaderButton,
} from "@/components/table/SortableHeaderButton";
import { formatDuration, formatNum, formatTime } from "@/lib/report/format";
import { vehicleSegmentColumns } from "@/lib/report/table-columns";
import type { VehicleTripSegment } from "@/lib/report/types";

type VehicleSegmentsTableProps = {
  segments: VehicleTripSegment[];
};

function formatAddress(address: string | null): string {
  return address?.trim() ? address : "—";
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
