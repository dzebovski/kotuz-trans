export function toRangeKey(from: string, to: string): string {
  return `${from}:${to}`;
}

export function shouldApplyRangeResponse(
  requestedFrom: string,
  requestedTo: string,
  activeFrom: string,
  activeTo: string,
): boolean {
  return requestedFrom === activeFrom && requestedTo === activeTo;
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
