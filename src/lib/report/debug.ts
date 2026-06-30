const FLEET_DEBUG_STORAGE_KEY = "fleet-debug";

export function isFleetDebugEnabled(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return window.localStorage.getItem(FLEET_DEBUG_STORAGE_KEY) === "1";
}

export function fleetDebug(event: string, fields: Record<string, unknown> = {}): void {
  if (!isFleetDebugEnabled()) {
    return;
  }
  console.debug("[fleet]", event, fields);
}
