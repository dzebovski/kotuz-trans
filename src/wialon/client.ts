import { getServerEnv, getWialonOperateAs } from "@/config/env";
import { log } from "@/utils/logger";
import { withRetry, isRetryableHttpStatus } from "@/utils/retry";
import { createAbortTimeout } from "@/utils/timeout";
import {
  sanitizeExternalErrorBody,
  WialonAuthError,
  WialonError,
  formatWialonErrorMessage,
} from "./errors";

type WialonResponse = {
  error?: number;
  reason?: string;
  eid?: string;
  user?: { id?: number; nm?: string; bact?: number };
  [key: string]: unknown;
};

export type WialonSessionInfo = {
  sid: string;
  userId?: number;
  userName?: string;
  accountId?: number;
};

export type WialonClientOptions = {
  apiUrl?: string;
  token?: string;
  operateAs?: string;
  requestTimeoutMs?: number;
  fetchImpl?: typeof fetch;
};

export class WialonClient {
  private readonly apiUrl: string;
  private readonly token: string;
  private readonly operateAs?: string;
  private readonly requestTimeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private sid: string | null = null;
  private sessionInfo: WialonSessionInfo | null = null;

  constructor(options: WialonClientOptions = {}) {
    if (options.apiUrl && options.token) {
      this.apiUrl = options.apiUrl;
      this.token = options.token;
      this.operateAs = options.operateAs;
      this.requestTimeoutMs = options.requestTimeoutMs ?? 15000;
    } else {
      const env = getServerEnv();
      this.apiUrl = options.apiUrl ?? env.WIALON_API_URL;
      this.token = options.token ?? env.WIALON_TOKEN;
      this.operateAs = options.operateAs ?? getWialonOperateAs(env);
      this.requestTimeoutMs =
        options.requestTimeoutMs ?? env.WIALON_REQUEST_TIMEOUT_MS;
    }
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  getSessionId(): string | null {
    return this.sid;
  }

  getSessionInfo(): WialonSessionInfo | null {
    return this.sessionInfo;
  }

  async login(): Promise<WialonSessionInfo> {
    const loginParams: Record<string, string> = { token: this.token };
    if (this.operateAs) {
      loginParams.operateAs = this.operateAs;
    }

    const response = await this.call<WialonResponse>(
      "token/login",
      loginParams,
      false,
    );
    if (!response.eid) {
      throw new WialonAuthError("Missing session id in login response");
    }
    this.sid = response.eid;
    this.sessionInfo = {
      sid: response.eid,
      userId: response.user?.id,
      userName: response.user?.nm,
      accountId: response.user?.bact,
    };
    return this.sessionInfo;
  }

  async logout(): Promise<void> {
    if (!this.sid) {
      return;
    }
    try {
      await this.call("core/logout", {}, true);
    } catch (error) {
      log("warn", "wialon_logout_failed", {
        message: error instanceof Error ? error.message : "unknown",
      });
    } finally {
      this.sid = null;
      this.sessionInfo = null;
    }
  }

  async call<T>(
    service: string,
    params: Record<string, unknown>,
    requiresSid = true,
  ): Promise<T> {
    if (requiresSid && !this.sid) {
      throw new WialonError(service, "Session is not initialized");
    }

    return withRetry(
      async () => {
        const body = new URLSearchParams();
        body.set("params", JSON.stringify(params));
        if (requiresSid && this.sid) {
          body.set("sid", this.sid);
        }

        const { signal, clear } = createAbortTimeout(this.requestTimeoutMs);
        try {
          const response = await this.fetchImpl(`${this.apiUrl}?svc=${service}`, {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body,
            signal,
          });
          clear();

          const text = await response.text();
          if (!response.ok) {
            if (isRetryableHttpStatus(response.status)) {
              throw new Error(`Retryable HTTP ${response.status}`);
            }
            throw new WialonError(
              service,
              `HTTP ${response.status}: ${sanitizeExternalErrorBody(text)}`,
            );
          }

          let payload: WialonResponse;
          try {
            payload = JSON.parse(text) as WialonResponse;
          } catch {
            throw new WialonError(
              service,
              `Invalid JSON response: ${sanitizeExternalErrorBody(text)}`,
            );
          }

          if (payload.error) {
            if (service === "token/login") {
              throw new WialonAuthError(
                payload.reason ?? "Authentication failed",
                payload.error,
              );
            }
            throw new WialonError(
              service,
              formatWialonErrorMessage(service, payload.error, payload.reason),
              payload.error,
            );
          }

          return payload as T;
        } catch (error) {
          clear();
          throw error;
        }
      },
      {
        shouldRetry: (error) => {
          if (error instanceof WialonAuthError) {
            return false;
          }
          if (error instanceof WialonError) {
            return false;
          }
          return true;
        },
      },
    );
  }
}
