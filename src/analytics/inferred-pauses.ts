export type InferredPause = {
  kind: "inferred";
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
};

export type SegmentForPauseInference = {
  started_at: string;
  ended_at: string;
};

export function inferPausesBetweenSegments(
  segments: SegmentForPauseInference[],
): InferredPause[] {
  if (segments.length < 2) {
    return [];
  }

  const sorted = [...segments].sort((a, b) =>
    a.started_at.localeCompare(b.started_at),
  );
  const pauses: InferredPause[] = [];

  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1];
    const current = sorted[index];
    const gapStart = new Date(previous.ended_at).getTime();
    const gapEnd = new Date(current.started_at).getTime();
    const durationSeconds = Math.round((gapEnd - gapStart) / 1000);
    if (durationSeconds > 0) {
      pauses.push({
        kind: "inferred",
        startedAt: previous.ended_at,
        endedAt: current.started_at,
        durationSeconds,
      });
    }
  }

  return pauses;
}
