export function parseDurationToSeconds(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  const daysTimeMatch = trimmed.match(
    /^(\d+)\s*days?\s+(\d{1,2}):(\d{2}):(\d{2})$/i,
  );
  if (daysTimeMatch) {
    const days = Number.parseInt(daysTimeMatch[1], 10);
    const hours = Number.parseInt(daysTimeMatch[2], 10);
    const minutes = Number.parseInt(daysTimeMatch[3], 10);
    const seconds = Number.parseInt(daysTimeMatch[4], 10);
    return days * 86400 + hours * 3600 + minutes * 60 + seconds;
  }

  const colonParts = trimmed.split(":").map((part) => Number.parseInt(part, 10));
  if (colonParts.every((part) => Number.isFinite(part))) {
    if (colonParts.length === 3) {
      return colonParts[0] * 3600 + colonParts[1] * 60 + colonParts[2];
    }
    if (colonParts.length === 2) {
      return colonParts[0] * 60 + colonParts[1];
    }
  }

  const dayMatch = trimmed.match(/(\d+)\s*d/i);
  const hourMatch = trimmed.match(/(\d+)\s*h/i);
  const minuteMatch = trimmed.match(/(\d+)\s*m/i);
  const secondMatch = trimmed.match(/(\d+)\s*s/i);
  if (dayMatch || hourMatch || minuteMatch || secondMatch) {
    const days = dayMatch ? Number.parseInt(dayMatch[1], 10) : 0;
    const hours = hourMatch ? Number.parseInt(hourMatch[1], 10) : 0;
    const minutes = minuteMatch ? Number.parseInt(minuteMatch[1], 10) : 0;
    const seconds = secondMatch ? Number.parseInt(secondMatch[1], 10) : 0;
    return days * 86400 + hours * 3600 + minutes * 60 + seconds;
  }

  return null;
}
