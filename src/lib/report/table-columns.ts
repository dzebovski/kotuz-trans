import {
  createColumnHelper,
} from "@tanstack/react-table";
import type { RangeVehicle, VehicleTripSegment } from "@/lib/report/types";
import { nullableNumber, nullableTimestamp } from "@/lib/report/table-sorting";

const fleetColumnHelper = createColumnHelper<RangeVehicle>();

export const rangeFleetColumns = [
  fleetColumnHelper.display({
    id: "vehicle",
    header: "",
  }),
  fleetColumnHelper.display({
    id: "route",
    header: "Маршрут",
  }),
  fleetColumnHelper.accessor((vehicle) => nullableNumber(vehicle.mileageKm), {
    id: "mileage",
    header: "Пробіг",
    sortUndefined: "last",
  }),
  fleetColumnHelper.accessor((vehicle) => nullableNumber(vehicle.fuelConsumedL), {
    id: "fuel",
    header: "Паливо",
    sortUndefined: "last",
  }),
  fleetColumnHelper.accessor(
    (vehicle) => nullableNumber(vehicle.consumptionLPer100Km),
    {
      id: "consumption",
      header: "л/100км",
      sortUndefined: "last",
    },
  ),
  fleetColumnHelper.display({
    id: "rolling1000",
    header: "Останні 1000 км",
  }),
  fleetColumnHelper.accessor(
    (vehicle) => nullableNumber(vehicle.movementDurationSeconds),
    {
      id: "movement",
      header: "Час руху",
      sortUndefined: "last",
    },
  ),
  fleetColumnHelper.display({
    id: "action",
    header: "",
  }),
];

const segmentColumnHelper = createColumnHelper<VehicleTripSegment>();

export const vehicleSegmentColumns = [
  segmentColumnHelper.accessor((segment) => nullableTimestamp(segment.startedAt), {
    id: "startedAt",
    header: "Початок",
    sortUndefined: "last",
  }),
  segmentColumnHelper.accessor((segment) => nullableTimestamp(segment.endedAt), {
    id: "endedAt",
    header: "Кінець",
    sortUndefined: "last",
  }),
  segmentColumnHelper.display({
    id: "startAddress",
    header: "Звідки",
  }),
  segmentColumnHelper.display({
    id: "endAddress",
    header: "Куди",
  }),
  segmentColumnHelper.accessor((segment) => nullableNumber(segment.mileageKm), {
    id: "mileage",
    header: "Км",
    sortUndefined: "last",
  }),
  segmentColumnHelper.accessor((segment) => nullableNumber(segment.fuelConsumedL), {
    id: "fuel",
    header: "Паливо",
    sortUndefined: "last",
  }),
  segmentColumnHelper.accessor(
    (segment) => nullableNumber(segment.averageFuelConsumptionLPer100Km),
    {
      id: "consumption",
      header: "л/100км",
      sortUndefined: "last",
    },
  ),
  segmentColumnHelper.accessor(
    (segment) => nullableNumber(segment.averageSpeedKmh),
    {
      id: "speed",
      header: "Швидкість",
      sortUndefined: "last",
    },
  ),
  segmentColumnHelper.accessor((segment) => (segment.isLocalManeuver ? 1 : 0), {
    id: "type",
    header: "Тип",
  }),
];
