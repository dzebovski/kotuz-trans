import { describe, expect, it, vi } from "vitest";
import { WialonClient } from "@/wialon/client";
import { runWialonReport } from "@/wialon/report-runner";

describe("wialon report lifecycle", () => {
  it("polls until status 4 and always cleans up", async () => {
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("token/login")) {
        calls.push("login");
        return new Response(JSON.stringify({ eid: "session-1" }));
      }
      if (url.includes("report/exec_report")) {
        calls.push("exec");
        return new Response(JSON.stringify({}));
      }
      if (url.includes("report/get_report_status")) {
        calls.push("status");
        return new Response(JSON.stringify({ status: 4 }));
      }
      if (url.includes("report/apply_report_result")) {
        calls.push("apply");
        return new Response(
          JSON.stringify({
            reportResult: {
              stats: [{ n: "Пробег в поездках", c: ["10 km"] }],
              tables: [],
            },
          }),
        );
      }
      if (url.includes("report/cleanup_result")) {
        calls.push("cleanup");
        return new Response(JSON.stringify({}));
      }
      if (url.includes("core/logout")) {
        calls.push("logout");
        return new Response(JSON.stringify({}));
      }
      return new Response(JSON.stringify({}));
    });

    const client = new WialonClient({
      apiUrl: "https://example.test/wialon/ajax.html",
      fetchImpl,
      token: "test-token",
    });
    await client.login();
    await runWialonReport(
      {
        reportResourceId: 2217,
        reportTemplateId: 5,
        reportObjectId: 6221,
        reportObjectSecId: 0,
        interval: { flags: 0, from: 1, to: 2 },
        remoteExec: 1,
      },
      {
        client,
        loadRows: false,
        pollIntervalMs: 10,
        reportTimeoutMs: 1000,
      },
    );

    expect(calls).toContain("cleanup");
    expect(calls).toContain("status");
  });

  it("fetches chart json after apply and before cleanup when enabled", async () => {
    const calls: string[] = [];
    let renderJsonParams: Record<string, unknown> | null = null;
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("token/login")) {
        return new Response(JSON.stringify({ eid: "session-1" }));
      }
      if (url.includes("report/exec_report")) {
        calls.push("exec");
        return new Response(JSON.stringify({}));
      }
      if (url.includes("report/get_report_status")) {
        calls.push("status");
        return new Response(JSON.stringify({ status: 4 }));
      }
      if (url.includes("report/apply_report_result")) {
        calls.push("apply");
        return new Response(
          JSON.stringify({
            reportResult: {
              stats: [],
              tables: [],
              attachments: 1,
            },
          }),
        );
      }
      if (url.includes("report/render_json")) {
        calls.push("render_json");
        const body = new URLSearchParams(String(init?.body ?? ""));
        renderJsonParams = JSON.parse(body.get("params") ?? "{}") as Record<
          string,
          unknown
        >;
        return new Response(
          JSON.stringify({
            datasets: {
              "0": {
                name: "Скорость, km/h",
                units: "km/h",
                y_axis: 0,
                data: { x: [0, 100], y: [88, 0] },
              },
            },
          }),
        );
      }
      if (url.includes("report/cleanup_result")) {
        calls.push("cleanup");
        return new Response(JSON.stringify({}));
      }
      if (url.includes("core/logout")) {
        return new Response(JSON.stringify({}));
      }
      return new Response(JSON.stringify({}));
    });

    const client = new WialonClient({
      apiUrl: "https://example.test/wialon/ajax.html",
      fetchImpl,
      token: "test-token",
    });
    await client.login();
    const result = await runWialonReport(
      {
        reportResourceId: 2217,
        reportTemplateId: 5,
        reportObjectId: 6221,
        reportObjectSecId: 0,
        interval: { flags: 0, from: 1, to: 2 },
        remoteExec: 1,
      },
      {
        client,
        loadRows: false,
        fetchChartJson: true,
        pollIntervalMs: 10,
        reportTimeoutMs: 1000,
      },
    );

    expect(result.chartJson?.datasets?.["0"]?.name).toContain("Скорость");
    expect(renderJsonParams).toMatchObject({
      attachmentIndex: 0,
      width: 1200,
      useCrop: 0,
      cropBegin: 1,
      cropEnd: 2,
    });
    expect(calls.indexOf("apply")).toBeLessThan(calls.indexOf("render_json"));
    expect(calls.indexOf("render_json")).toBeLessThan(calls.indexOf("cleanup"));
  });

  it("continues report run when render_json fails", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("token/login")) {
        return new Response(JSON.stringify({ eid: "session-1" }));
      }
      if (url.includes("report/exec_report")) {
        return new Response(JSON.stringify({}));
      }
      if (url.includes("report/get_report_status")) {
        return new Response(JSON.stringify({ status: 4 }));
      }
      if (url.includes("report/apply_report_result")) {
        return new Response(
          JSON.stringify({
            reportResult: {
              stats: [{ n: "Пробег в поездках", c: ["10 km"] }],
              tables: [],
              attachments: 1,
            },
          }),
        );
      }
      if (url.includes("report/render_json")) {
        return new Response(JSON.stringify({ error: 4, reason: "bad params" }));
      }
      if (url.includes("report/cleanup_result") || url.includes("core/logout")) {
        return new Response(JSON.stringify({}));
      }
      return new Response(JSON.stringify({}));
    });

    const client = new WialonClient({
      apiUrl: "https://example.test/wialon/ajax.html",
      fetchImpl,
      token: "test-token",
    });
    await client.login();
    const result = await runWialonReport(
      {
        reportResourceId: 2217,
        reportTemplateId: 5,
        reportObjectId: 6221,
        reportObjectSecId: 0,
        interval: { flags: 0, from: 1, to: 2 },
        remoteExec: 1,
      },
      {
        client,
        loadRows: false,
        fetchChartJson: true,
        pollIntervalMs: 10,
        reportTimeoutMs: 1000,
      },
    );

    expect(result.chartJson).toBeNull();
    expect(result.chartFetchWarning).toContain("Fuel report chart fetch failed");
    expect(result.stats).toHaveLength(1);
  });

  it("accepts string report status from Wialon API", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("token/login")) {
        return new Response(JSON.stringify({ eid: "session-1" }));
      }
      if (url.includes("report/exec_report")) {
        return new Response(JSON.stringify({}));
      }
      if (url.includes("report/get_report_status")) {
        return new Response(JSON.stringify({ status: "4" }));
      }
      if (url.includes("report/apply_report_result")) {
        return new Response(
          JSON.stringify({
            reportResult: { stats: [], tables: [] },
          }),
        );
      }
      if (url.includes("report/cleanup_result") || url.includes("core/logout")) {
        return new Response(JSON.stringify({}));
      }
      return new Response(JSON.stringify({}));
    });

    const client = new WialonClient({
      apiUrl: "https://example.test/wialon/ajax.html",
      fetchImpl,
      token: "test-token",
    });
    await client.login();

    await expect(
      runWialonReport(
        {
          reportResourceId: 2217,
          reportTemplateId: 5,
          reportObjectId: 6221,
          reportObjectSecId: 0,
          interval: { flags: 0, from: 1, to: 2 },
          remoteExec: 1,
        },
        { client, loadRows: false, pollIntervalMs: 10, reportTimeoutMs: 1000 },
      ),
    ).resolves.toBeDefined();
  });

  it("throws on canceled status 8", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("token/login")) {
        return new Response(JSON.stringify({ eid: "session-1" }));
      }
      if (url.includes("report/exec_report")) {
        return new Response(JSON.stringify({}));
      }
      if (url.includes("report/get_report_status")) {
        return new Response(JSON.stringify({ status: 8 }));
      }
      if (url.includes("report/cleanup_result") || url.includes("core/logout")) {
        return new Response(JSON.stringify({}));
      }
      return new Response(JSON.stringify({}));
    });

    const client = new WialonClient({
      apiUrl: "https://example.test/wialon/ajax.html",
      fetchImpl,
      token: "test-token",
    });
    await client.login();

    await expect(
      runWialonReport(
        {
          reportResourceId: 2217,
          reportTemplateId: 5,
          reportObjectId: 6221,
          reportObjectSecId: 0,
          interval: { flags: 0, from: 1, to: 2 },
          remoteExec: 1,
        },
        { client, loadRows: false, reportTimeoutMs: 1000, pollIntervalMs: 10 },
      ),
    ).rejects.toThrow("canceled");
  });

  it("cleans up after parser-level failures", async () => {
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("token/login")) {
        return new Response(JSON.stringify({ eid: "session-1" }));
      }
      if (url.includes("report/exec_report")) {
        return new Response(JSON.stringify({}));
      }
      if (url.includes("report/get_report_status")) {
        return new Response(JSON.stringify({ status: 16 }));
      }
      if (url.includes("report/cleanup_result")) {
        calls.push("cleanup");
        return new Response(JSON.stringify({}));
      }
      if (url.includes("core/logout")) {
        return new Response(JSON.stringify({}));
      }
      return new Response(JSON.stringify({}));
    });

    const client = new WialonClient({
      apiUrl: "https://example.test/wialon/ajax.html",
      fetchImpl,
      token: "test-token",
    });
    await client.login();

    await expect(
      runWialonReport(
        {
          reportResourceId: 2217,
          reportTemplateId: 5,
          reportObjectId: 6221,
          reportObjectSecId: 0,
          interval: { flags: 0, from: 1, to: 2 },
          remoteExec: 1,
        },
        { client, loadRows: false, reportTimeoutMs: 1000, pollIntervalMs: 10 },
      ),
    ).rejects.toThrow();

    expect(calls).toContain("cleanup");
  });
});
