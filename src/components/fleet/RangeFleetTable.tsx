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
import type { RangeVehicle } from "@/lib/report/types";
import { rangeFleetColumns } from "@/lib/report/table-columns";
import { RangeVehicleRow } from "@/components/fleet/RangeVehicleRow";
import { SortableHeaderButton } from "@/components/table/SortableHeaderButton";

type RangeFleetTableProps = {
  vehicles: RangeVehicle[];
  from: string;
  to: string;
};

const HEADER_CLASS_BY_ID: Record<string, string> = {
  vehicle: "range-fleet-table__head-cell",
  route: "range-fleet-table__head-cell range-fleet-grid__metric",
  mileage: "range-fleet-grid__metric",
  fuel: "range-fleet-grid__metric",
  consumption: "range-fleet-grid__metric",
  rolling1000: "range-fleet-table__head-cell range-fleet-grid__metric",
  movement: "range-fleet-grid__metric",
  action: "range-fleet-table__head-cell range-fleet-grid__action",
};

function FleetHeaderCell({ header }: { header: Header<RangeVehicle, unknown> }) {
  const className = HEADER_CLASS_BY_ID[header.column.id] ?? "range-fleet-table__head-cell";

  if (header.column.getCanSort()) {
    return (
      <SortableHeaderButton
        header={header}
        className={`range-fleet-table__sort-btn ${className}`}
        activeClassName="range-fleet-table__sort-btn--active"
        role="columnheader"
      />
    );
  }

  const content = header.isPlaceholder
    ? null
    : flexRender(header.column.columnDef.header, header.getContext());
  return (
    <div className={className} role="columnheader">
      {content}
    </div>
  );
}

export function RangeFleetTable({ vehicles, from, to }: RangeFleetTableProps) {
  const [sorting, setSorting] = useState<SortingState>([
    { id: "mileage", desc: true },
  ]);
  const table = useReactTable({
    data: vehicles,
    columns: rangeFleetColumns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: (vehicle) => vehicle.vehicle.id,
  });
  const headerGroup = table.getHeaderGroups()[0];
  const rows = table.getRowModel().rows;

  return (
    <div className="range-fleet-table">
      <div className="range-fleet-table__viewport">
        <div className="range-fleet-table__header range-fleet-grid" role="row">
          {headerGroup.headers.map((header) => (
            <FleetHeaderCell key={header.id} header={header} />
          ))}
        </div>
        <div className="range-fleet-table__body" role="rowgroup">
          {rows.length > 0 ? (
            rows.map((row) => (
              <RangeVehicleRow
                key={row.id}
                vehicle={row.original}
                from={from}
                to={to}
              />
            ))
          ) : (
            <div className="empty-state empty-state--table">
              За цим пошуком машин не знайдено.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
