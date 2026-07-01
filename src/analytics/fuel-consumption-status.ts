export type ConsumptionTier = 30 | 32;

export type FuelConsumptionStatus =
  | "not_evaluated"
  | "normal"
  | "avrg"
  | "high";

export const FUEL_STATUS_RANK: Record<FuelConsumptionStatus, number> = {
  not_evaluated: 0,
  normal: 1,
  avrg: 2,
  high: 3,
};

/** Minimum daily mileage before l/100km and fuel status are meaningful. */
export const MIN_MILEAGE_KM_FOR_CONSUMPTION_EVAL = 10;

export function isConsumptionEvaluable(
  mileageKm: number | null | undefined,
): boolean {
  return (
    mileageKm != null &&
    !Number.isNaN(mileageKm) &&
    mileageKm >= MIN_MILEAGE_KM_FOR_CONSUMPTION_EVAL
  );
}

export function getConsumptionBounds(tier: ConsumptionTier): {
  normalMax: number;
  avrgMax: number;
} {
  return tier === 32 ? { normalMax: 29, avrgMax: 32 } : { normalMax: 27, avrgMax: 30 };
}

export function evaluateFuelConsumptionStatus(
  actualLPer100Km: number | null,
  tier: ConsumptionTier | null,
  mileageKm?: number | null,
): FuelConsumptionStatus {
  if (mileageKm !== undefined && !isConsumptionEvaluable(mileageKm)) {
    return "not_evaluated";
  }
  if (actualLPer100Km == null || tier == null) {
    return "not_evaluated";
  }

  const { normalMax, avrgMax } = getConsumptionBounds(tier);
  if (actualLPer100Km <= normalMax) {
    return "normal";
  }
  if (actualLPer100Km <= avrgMax) {
    return "avrg";
  }
  return "high";
}

export function worstFuelStatus(
  statuses: FuelConsumptionStatus[],
): FuelConsumptionStatus | null {
  let worst: FuelConsumptionStatus | null = null;
  for (const status of statuses) {
    if (status === "not_evaluated") {
      continue;
    }
    if (
      worst == null ||
      FUEL_STATUS_RANK[status] > FUEL_STATUS_RANK[worst]
    ) {
      worst = status;
    }
  }
  return worst;
}

export function fuelStatusBadgeTone(
  status: FuelConsumptionStatus | string,
): "success" | "avrg" | "danger" | undefined {
  if (status === "normal") {
    return "success";
  }
  if (status === "avrg") {
    return "avrg";
  }
  if (status === "high") {
    return "danger";
  }
  return undefined;
}

export function fuelStatusTextClass(
  status: FuelConsumptionStatus | string,
): string | undefined {
  const tone = fuelStatusBadgeTone(status);
  if (tone === "success") {
    return "fuel-consumption-text--success";
  }
  if (tone === "avrg") {
    return "fuel-consumption-text--avrg";
  }
  if (tone === "danger") {
    return "fuel-consumption-text--danger";
  }
  return undefined;
}

export function getSegmentFuelConsumptionClass(
  actualLPer100Km: number | null,
  tier: ConsumptionTier | null,
  mileageKm?: number | null,
): string | undefined {
  if (mileageKm !== undefined && !isConsumptionEvaluable(mileageKm)) {
    return undefined;
  }
  return fuelStatusTextClass(
    evaluateFuelConsumptionStatus(actualLPer100Km, tier),
  );
}

export function formatReportDaysLabel(count: number): string {
  const n = Math.abs(count);
  const mod10 = n % 10;
  const mod100 = n % 100;
  let word: string;
  if (mod10 === 1 && mod100 !== 11) {
    word = "день";
  } else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    word = "дня";
  } else {
    word = "днів";
  }
  return `Звіт за ${count} ${word}`;
}

export function fuelStatusLabel(
  status: FuelConsumptionStatus | string | null | undefined,
): string | null {
  if (status === "normal") {
    return "чудовий розхід";
  }
  if (status === "avrg") {
    return "нормальний розхід";
  }
  if (status === "high") {
    return "високий розхід";
  }
  return null;
}

function capitalizeFuelStatusLabel(label: string): string {
  if (!label) {
    return label;
  }
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function formatFuelLitersForBadge(value: number): string {
  const rounded = Number(value.toFixed(1));
  const formatted = rounded.toLocaleString("uk-UA", {
    maximumFractionDigits: 1,
  });
  return `${formatted}л`;
}

export function formatFuelStatusBadgeLabel(
  status: FuelConsumptionStatus | string | null | undefined,
  consumptionLPer100Km: number | null,
): string | null {
  const label = fuelStatusLabel(status);
  if (!label) {
    return null;
  }
  const titled = capitalizeFuelStatusLabel(label);
  if (consumptionLPer100Km == null || Number.isNaN(consumptionLPer100Km)) {
    return titled;
  }
  return `${titled} - ${formatFuelLitersForBadge(consumptionLPer100Km)}`;
}

export function formatHighDaysBadgeLabel(count: number): string {
  return `Днів з високим розходом: ${count}`;
}

export type FuelStatusCounts = {
  normal: number;
  avrg: number;
  high: number;
};

export function countFuelStatusByVehicle(
  vehicles: Array<{ fuelStatus: FuelConsumptionStatus | string | null }>,
): FuelStatusCounts {
  const counts: FuelStatusCounts = { normal: 0, avrg: 0, high: 0 };
  for (const vehicle of vehicles) {
    if (vehicle.fuelStatus === "normal") {
      counts.normal += 1;
    } else if (vehicle.fuelStatus === "avrg") {
      counts.avrg += 1;
    } else if (vehicle.fuelStatus === "high") {
      counts.high += 1;
    }
  }
  return counts;
}
