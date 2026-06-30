import type { VehicleTripSegment } from "@/lib/report/types";

export type VehicleSegmentsSummary = {
  segmentCount: number;
  movementDayCount: number;
  firstStartedAt: string;
  lastEndedAt: string;
  startAddress: string | null;
  endAddress: string | null;
};

export function buildVehicleSegmentsSummary(
  segments: VehicleTripSegment[],
): VehicleSegmentsSummary | null {
  if (segments.length === 0) {
    return null;
  }

  const firstSegment = segments.reduce((earliest, segment) =>
    segment.startedAt < earliest.startedAt ? segment : earliest,
  );
  const lastSegment = segments.reduce((latest, segment) =>
    segment.endedAt > latest.endedAt ? segment : latest,
  );

  return {
    segmentCount: segments.length,
    movementDayCount: new Set(segments.map((segment) => segment.reportDate)).size,
    firstStartedAt: firstSegment.startedAt,
    lastEndedAt: lastSegment.endedAt,
    startAddress: firstSegment.startAddress,
    endAddress: lastSegment.endAddress,
  };
}
