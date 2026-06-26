import {
  createTable,
  getCoreRowModel,
  getSortedRowModel,
  type SortingState,
  type Table,
  type TableOptions,
} from "@tanstack/react-table";
import { describe, expect, it } from "vitest";
import {
  rangeFleetColumns,
  vehicleSegmentColumns,
} from "@/lib/report/table-columns";
import type { RangeVehicle, VehicleTripSegment } from "@/lib/report/types";

function createSortingTable<TData>({
  data,
  columns,
  sorting: initialSorting,
  getRowId,
}: {
  data: TData[];
  columns: TableOptions<TData>["columns"];
  sorting: SortingState;
  getRowId: (row: TData) => string;
}): { table: Table<TData>; getSorting: () => SortingState } {
  let sorting = initialSorting;
  const table = createTable<TData>({
    data,
    columns,
    state: { sorting },
    onSortingChange: (updater) => {
      sorting = typeof updater === "function" ? updater(sorting) : updater;
      table.setOptions((previous) => ({
        ...previous,
        state: { ...previous.state, sorting },
      }));
    },
    onStateChange: () => {},
    renderFallbackValue: null,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId,
  });

  return { table, getSorting: () => sorting };
}

function sortedIds<TData>(table: Table<TData>): string[] {
  return table.getRowModel().rows.map((row) => row.id);
}

function vehicle(
  overrides: Partial<RangeVehicle> & Pick<RangeVehicle, "vehicle">,
): RangeVehicle {
  return {
    mileageKm: 100,
    fuelConsumedL: 20,
    consumptionLPer100Km: 20,
    rolling1000KmConsumptionLPer100Km: 22,
    movementDurationSeconds: 3600,
    averageSpeedKmh: 100,
    parkingCount: 1,
    parkingDurationSeconds: 600,
    maxSpeedKmh: 80,
    refillCount: 0,
    refilledL: 0,
    fuelStatus: "normal",
    highDays: 0,
    days: [],
    ...overrides,
  };
}

function segment(overrides: Partial<VehicleTripSegment> & Pick<VehicleTripSegment, "id">): VehicleTripSegment {
  return {
    dailyTripId: "trip-1",
    reportDate: "2026-06-22",
    startedAt: "2026-06-22T08:00:00Z",
    endedAt: "2026-06-22T09:00:00Z",
    durationSeconds: 3600,
    mileageKm: 80,
    fuelConsumedL: 20,
    averageFuelConsumptionLPer100Km: 25,
    averageSpeedKmh: 80,
    maxSpeedKmh: 92,
    startLatitude: null,
    startLongitude: null,
    startAddress: "Kyiv",
    endLatitude: null,
    endLongitude: null,
    endAddress: "Zhytomyr",
    isLocalManeuver: false,
    ...overrides,
  };
}

describe("range fleet table sorting", () => {
  const vehicles = [
    vehicle({
      vehicle: { id: "a", displayName: "A", tractorNumber: "A", wialonUnitId: 1 },
      mileageKm: 300,
      fuelConsumedL: 90,
      consumptionLPer100Km: 30,
      movementDurationSeconds: 7200,
    }),
    vehicle({
      vehicle: { id: "b", displayName: "B", tractorNumber: "B", wialonUnitId: 2 },
      mileageKm: 100,
      fuelConsumedL: 10,
      consumptionLPer100Km: null,
      movementDurationSeconds: 1800,
    }),
    vehicle({
      vehicle: { id: "c", displayName: "C", tractorNumber: "C", wialonUnitId: 3 },
      mileageKm: 200,
      fuelConsumedL: 50,
      consumptionLPer100Km: 25,
      movementDurationSeconds: 5400,
    }),
  ];

  it("sorts by mileage descending by default", () => {
    const { table } = createSortingTable({
      data: vehicles,
      columns: rangeFleetColumns,
      sorting: [{ id: "mileage", desc: true }],
      getRowId: (item) => item.vehicle.id,
    });

    expect(sortedIds(table)).toEqual(["a", "c", "b"]);
  });

  it("toggles a fleet metric from descending to ascending", () => {
    const { table, getSorting } = createSortingTable({
      data: vehicles,
      columns: rangeFleetColumns,
      sorting: [{ id: "mileage", desc: true }],
      getRowId: (item) => item.vehicle.id,
    });

    table.getColumn("fuel")!.toggleSorting();
    expect(getSorting()).toEqual([{ id: "fuel", desc: true }]);
    expect(sortedIds(table)).toEqual(["a", "c", "b"]);

    table.getColumn("fuel")!.toggleSorting();
    expect(getSorting()).toEqual([{ id: "fuel", desc: false }]);
    expect(sortedIds(table)).toEqual(["b", "c", "a"]);
  });

  it("keeps null fleet values last in both directions", () => {
    const descending = createSortingTable({
      data: vehicles,
      columns: rangeFleetColumns,
      sorting: [{ id: "consumption", desc: true }],
      getRowId: (item) => item.vehicle.id,
    }).table;
    const ascending = createSortingTable({
      data: vehicles,
      columns: rangeFleetColumns,
      sorting: [{ id: "consumption", desc: false }],
      getRowId: (item) => item.vehicle.id,
    }).table;

    expect(sortedIds(descending)).toEqual(["a", "c", "b"]);
    expect(sortedIds(ascending)).toEqual(["c", "a", "b"]);
  });
});

describe("vehicle segment table sorting", () => {
  const segments = [
    segment({
      id: "missing",
      startedAt: "2026-06-22T10:00:00Z",
      endedAt: "2026-06-22T10:30:00Z",
      mileageKm: 30,
      fuelConsumedL: null,
      averageFuelConsumptionLPer100Km: null,
      averageSpeedKmh: null,
    }),
    segment({
      id: "local",
      startedAt: "2026-06-22T11:00:00Z",
      endedAt: "2026-06-22T11:20:00Z",
      mileageKm: 5,
      fuelConsumedL: 1,
      averageFuelConsumptionLPer100Km: 20,
      averageSpeedKmh: 15,
      isLocalManeuver: true,
    }),
    segment({
      id: "fast",
      startedAt: "2026-06-22T09:30:00Z",
      endedAt: "2026-06-22T10:00:00Z",
      mileageKm: 100,
      fuelConsumedL: 30,
      averageFuelConsumptionLPer100Km: 30,
      averageSpeedKmh: 100,
    }),
    segment({
      id: "early",
      startedAt: "2026-06-22T08:00:00Z",
      endedAt: "2026-06-22T09:00:00Z",
      mileageKm: 80,
      fuelConsumedL: 20,
      averageFuelConsumptionLPer100Km: 25,
      averageSpeedKmh: 80,
    }),
  ];

  it("sorts segments by start time ascending by default", () => {
    const { table } = createSortingTable({
      data: segments,
      columns: vehicleSegmentColumns,
      sorting: [{ id: "startedAt", desc: false }],
      getRowId: (item) => item.id,
    });

    expect(sortedIds(table)).toEqual(["early", "fast", "missing", "local"]);
  });

  it("sorts segment metrics and keeps nullable values last", () => {
    expect(
      sortedIds(
        createSortingTable({
          data: segments,
          columns: vehicleSegmentColumns,
          sorting: [{ id: "mileage", desc: true }],
          getRowId: (item) => item.id,
        }).table,
      ),
    ).toEqual(["fast", "early", "missing", "local"]);

    expect(
      sortedIds(
        createSortingTable({
          data: segments,
          columns: vehicleSegmentColumns,
          sorting: [{ id: "fuel", desc: false }],
          getRowId: (item) => item.id,
        }).table,
      ),
    ).toEqual(["local", "early", "fast", "missing"]);

    expect(
      sortedIds(
        createSortingTable({
          data: segments,
          columns: vehicleSegmentColumns,
          sorting: [{ id: "consumption", desc: true }],
          getRowId: (item) => item.id,
        }).table,
      ),
    ).toEqual(["fast", "early", "local", "missing"]);

    expect(
      sortedIds(
        createSortingTable({
          data: segments,
          columns: vehicleSegmentColumns,
          sorting: [{ id: "speed", desc: false }],
          getRowId: (item) => item.id,
        }).table,
      ),
    ).toEqual(["local", "early", "fast", "missing"]);
  });

  it("sorts segment type by local maneuver flag", () => {
    const { table } = createSortingTable({
      data: segments,
      columns: vehicleSegmentColumns,
      sorting: [{ id: "type", desc: true }],
      getRowId: (item) => item.id,
    });

    expect(sortedIds(table)[0]).toBe("local");
  });
});
