const WIALON_ERROR_MESSAGES: Record<number, string> = {
  1: "INVALID_SESSION",
  2: "INVALID_SERVICE",
  3: "INVALID_RESULT",
  4: "INVALID_INPUT",
  5: "ERROR_EXECUTING_REQUEST",
  6: "UNKNOWN_ERROR",
  7: "ACCESS_DENIED",
  8: "INVALID_AUTH",
};

export function formatWialonErrorMessage(
  service: string,
  code?: number,
  reason?: string,
): string {
  const codeLabel =
    code != null ? WIALON_ERROR_MESSAGES[code] ?? `ERROR_${code}` : "UNKNOWN";
  const detail = reason?.trim();
  if (detail) {
    return `${service}: ${codeLabel} (${detail})`;
  }
  if (code === 7) {
    return `${service}: ACCESS_DENIED (token has no access to this unit/report resource)`;
  }
  return `${service}: ${codeLabel}`;
}

export class WialonError extends Error {
  readonly code?: number;
  readonly service: string;

  constructor(service: string, message: string, code?: number) {
    super(message);
    this.name = "WialonError";
    this.service = service;
    this.code = code;
  }
}

export class WialonReportError extends WialonError {
  readonly status?: number;

  constructor(message: string, status?: number, code?: number) {
    super("report", message, code);
    this.name = "WialonReportError";
    this.status = status;
  }
}

export class WialonAuthError extends WialonError {
  constructor(message: string, code?: number) {
    super("token/login", message, code);
    this.name = "WialonAuthError";
  }
}

export function sanitizeExternalErrorBody(body: string): string {
  return body
    .replace(/"token"\s*:\s*"[^"]*"/gi, '"token":"[redacted]"')
    .replace(/sid=[^&\s"]+/gi, "sid=[redacted]")
    .slice(0, 500);
}
