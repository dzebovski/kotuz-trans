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
  queueStatus: string | null;
  queueRunAfter: string | null;
  lastError: string | null;
  updatedAt: string | null;
  currentVehicles?: Array<{ wialonUnitId: number; displayName: string }>;
};

export type RangeStatusResponse = {
  range: { from: string; to: string; today: string };
  ready: boolean;
  partialReady: boolean;
  coverage: CoverageDay[];
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
  startCountryCode: string | null;
  endCountryCode: string | null;
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

export type RunRangeIdleReason =
  | "deadline"
  | "empty"
  | "backoff"
  | "exhausted"
  | "out_of_range";

export type RunRangeResponse = {
  ok: boolean;
  status: "completed" | "partial" | "failed" | "skipped" | "idle" | "running";
  reportDate?: string;
  reason?: string | null;
  idleReason?: RunRangeIdleReason;
  remaining?: number;
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

export type VehicleReportResponse = {
  range: { from: string; to: string; today: string };
  ready: boolean;
  partialReady: boolean;
  coverage: CoverageDay[];
  vehicle: RangeVehicle | null;
};

export type VehicleIngestResponse = {
  ok: boolean;
  status:
    | "completed"
    | "partial"
    | "failed"
    | "skipped"
    | "idle"
    | "blocked";
  reportDate?: string;
  reason?: string | null;
};

export type CoverageDiagnosticsVehicle = {
  vehicleId: string;
  displayName: string;
  tractorNumber: string;
  wialonUnitId: number;
  status: string;
  attempts: number;
  lastError: string | null;
  startedAt: string | null;
  completedAt: string | null;
};

export type CoverageDiagnosticsEvent = {
  id: string;
  scope: string;
  eventType: string;
  attempt: number | null;
  status: string | null;
  message: string | null;
  vehicleId: string | null;
  createdAt: string;
};

export type CoverageDiagnosticsDay = {
  date: string;
  runStatus: string | null;
  vehicles: CoverageDiagnosticsVehicle[];
  failedVehicles: CoverageDiagnosticsVehicle[];
  retryExhausted: boolean;
  queueAttempts: number;
  queueLastError: string | null;
  recentEvents: CoverageDiagnosticsEvent[];
};

export type CoverageDiagnosticsResponse = {
  range: { from: string; to: string };
  days: CoverageDiagnosticsDay[];
};
