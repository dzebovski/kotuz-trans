export type CoverageState =
  | "ready"
  | "provisional"
  | "missing"
  | "queued"
  | "running"
  | "partial"
  | "failed";

export type CoverageDay = {
  date: string;
  state: CoverageState;
  ready: boolean;
  isToday: boolean;
  successfulVehicles: number;
  failedVehicles: number;
  expectedVehicles: number;
  queueAttempts: number;
  lastError: string | null;
  updatedAt: string | null;
};

export type RangeDay = {
  id: string;
  reportDate: string;
  mileageKm: number;
  fuelConsumedL: number | null;
  averageFuelConsumptionLPer100Km: number | null;
  rolling1000KmConsumptionLPer100Km: number | null;
  movementDurationSeconds: number | null;
  averageSpeedKmh: number | null;
  parkingCount: number;
  parkingDurationSeconds: number | null;
  maxSpeedKmh: number | null;
  refillCount: number;
  refilledL: number;
  fuelStatus: string;
  routeKey: string | null;
};

export type RangeVehicle = {
  vehicle: {
    id: string;
    displayName: string;
    tractorNumber: string;
    wialonUnitId: number;
    consumptionTier?: 30 | 32 | null;
  };
  mileageKm: number;
  fuelConsumedL: number;
  consumptionLPer100Km: number | null;
  rolling1000KmConsumptionLPer100Km: number | null;
  movementDurationSeconds: number;
  averageSpeedKmh: number | null;
  parkingCount: number;
  parkingDurationSeconds: number;
  maxSpeedKmh: number | null;
  refillCount: number;
  refilledL: number;
  fuelStatus: string | null;
  highDays: number;
  days: RangeDay[];
};

export type RangeResponse = {
  range: { from: string; to: string; today: string };
  ready: boolean;
  partialReady: boolean;
  coverage: CoverageDay[];
  summary: {
    vehicleCount: number;
    dateCount: number;
    totalMileageKm: number;
    totalFuelL: number;
    totalMovementSeconds: number;
    fuelStatusCounts: {
      normal: number;
      avrg: number;
      high: number;
    };
  } | null;
  vehicles: RangeVehicle[];
};

export type RunRangeResponse = {
  ok: boolean;
  status: "completed" | "partial" | "failed" | "skipped" | "idle";
  reportDate?: string;
  reason?: string | null;
};

export type EnsureRangeResponse = {
  ok: boolean;
  queued: string[];
  skipped: string[];
};

export type VehicleTripSegment = {
  id: string;
  dailyTripId: string;
  reportDate: string;
  startedAt: string;
  endedAt: string;
  durationSeconds: number | null;
  mileageKm: number;
  fuelConsumedL: number | null;
  averageFuelConsumptionLPer100Km: number | null;
  averageSpeedKmh: number | null;
  maxSpeedKmh: number | null;
  startLatitude: number | null;
  startLongitude: number | null;
  startAddress: string | null;
  endLatitude: number | null;
  endLongitude: number | null;
  endAddress: string | null;
  isLocalManeuver: boolean;
};

export type VehicleFuelRefill = {
  id: string;
  dailyTripId: string;
  reportDate: string;
  eventTime: string;
  volumeL: number;
  latitude: number | null;
  longitude: number | null;
  address: string | null;
};

export type VehicleDetailsResponse = {
  segments: VehicleTripSegment[];
  refills: VehicleFuelRefill[];
};
