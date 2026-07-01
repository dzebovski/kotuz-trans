export const SPEED_LIMIT_KMH = 86;

/**
 * Step-function integration over Wialon chart points: speed at index i
 * holds until the next timestamp. Only intervals where speed > threshold count.
 */
export function calculateOverSpeedDurationSeconds(
  timestamps: number[],
  speedsKmh: number[],
  thresholdKmh = SPEED_LIMIT_KMH,
): number {
  if (timestamps.length !== speedsKmh.length || timestamps.length < 2) {
    return 0;
  }

  let totalSeconds = 0;
  for (let i = 0; i < timestamps.length - 1; i += 1) {
    const dt = timestamps[i + 1] - timestamps[i];
    if (dt <= 0) {
      continue;
    }
    if (speedsKmh[i] > thresholdKmh) {
      totalSeconds += dt;
    }
  }
  return totalSeconds;
}
