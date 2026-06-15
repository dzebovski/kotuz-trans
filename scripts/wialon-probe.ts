import "dotenv/config";
import { getServerEnv, getWialonOperateAs } from "../src/config/env";
import { sleep } from "../src/utils/timeout";

type Json = Record<string, unknown>;

async function wialonCall(
  apiUrl: string,
  sid: string | null,
  svc: string,
  params: Json,
): Promise<Json> {
  const body = new URLSearchParams();
  body.set("params", JSON.stringify(params));
  if (sid) {
    body.set("sid", sid);
  }
  const response = await fetch(`${apiUrl}?svc=${svc}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  return response.json() as Promise<Json>;
}

async function tryLogin(
  apiUrl: string,
  token: string,
  operateAs?: string,
): Promise<Json> {
  const params: Json = { token };
  if (operateAs) {
    params.operateAs = operateAs;
  }
  return wialonCall(apiUrl, null, "token/login", params);
}

async function probeSession(apiUrl: string, login: Json): Promise<Json> {
  const sid = String(login.eid);
  const user = login.user as { id?: number; nm?: string } | undefined;

  const units = await wialonCall(apiUrl, sid, "core/search_items", {
    spec: {
      itemsType: "avl_unit",
      propName: "sys_name",
      propValueMask: "*",
      sortType: "sys_name",
    },
    force: 1,
    flags: 1,
    from: 0,
    to: 50,
  });

  const resources = await wialonCall(apiUrl, sid, "core/search_items", {
    spec: {
      itemsType: "avl_resource",
      propName: "sys_name",
      propValueMask: "*",
      sortType: "sys_name",
    },
    force: 1,
    flags: 1,
    from: 0,
    to: 20,
  });

  const unitItems = (units.items as Array<{ id: number; nm: string }> | undefined) ?? [];
  const resourceItems =
    (resources.items as Array<{ id: number; nm: string }> | undefined) ?? [];

  let reportTest: Json | null = null;
  const probeUnitId = unitItems[0]?.id ?? 6221;

  const exec = await wialonCall(apiUrl, sid, "report/exec_report", {
    reportResourceId: 2217,
    reportTemplateId: 5,
    reportTemplate: null,
    reportObjectId: probeUnitId,
    reportObjectSecId: 0,
    interval: { flags: 16777218, from: 0, to: 1 },
    remoteExec: 1,
  });

  if (exec.error) {
    reportTest = {
      unitId: probeUnitId,
      execError: exec.error,
      message:
        exec.error === 7
          ? "ACCESS_DENIED: token cannot run report for this unit"
          : "exec_report failed",
    };
  } else {
    let status = 0;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const statusResponse = await wialonCall(apiUrl, sid, "report/get_report_status", {});
      status = Number(statusResponse.status ?? 0);
      if (status === 4 || status === 8 || status === 16) {
        break;
      }
      await sleep(500);
    }
    reportTest = { unitId: probeUnitId, reportStatus: status };
    await wialonCall(apiUrl, sid, "report/cleanup_result", {});
  }

  await wialonCall(apiUrl, sid, "core/logout", {});

  return {
    wialonUser: user?.nm,
    wialonUserId: user?.id,
    visibleUnits: units.totalItemsCount ?? unitItems.length,
    unitSample: unitItems.slice(0, 5).map((unit) => ({ id: unit.id, name: unit.nm })),
    visibleResources: resources.totalItemsCount ?? resourceItems.length,
    resources: resourceItems.map((resource) => ({ id: resource.id, name: resource.nm })),
    reportTest,
  };
}

async function main(): Promise<void> {
  const env = getServerEnv();
  const operateAs = getWialonOperateAs(env);
  const wialonUser = process.env.WIALON_USER;

  const tokenOnlyLogin = await tryLogin(env.WIALON_API_URL, env.WIALON_TOKEN);
  const operateAsTarget = operateAs ?? wialonUser;
  const operateAsLogin = operateAsTarget
    ? await tryLogin(env.WIALON_API_URL, env.WIALON_TOKEN, operateAsTarget)
    : null;

  const operateAsCheck =
    operateAsTarget && operateAsLogin
      ? {
          target: operateAsTarget,
          error: operateAsLogin.error ?? null,
          reason: operateAsLogin.reason ?? null,
          ok: !operateAsLogin.error,
        }
      : null;

  if (tokenOnlyLogin.error) {
    throw new Error(
      `Token login failed: error ${String(tokenOnlyLogin.error)} ${String(tokenOnlyLogin.reason ?? "")}`.trim(),
    );
  }

  const session = await probeSession(env.WIALON_API_URL, tokenOnlyLogin);
  const ok =
    Number(session.visibleUnits) > 0 &&
    !(session.reportTest as { execError?: number } | null)?.execError;

  console.log(
    JSON.stringify(
      {
        ok,
        tokenLength: env.WIALON_TOKEN.length,
        wialonUserEnv: wialonUser ?? null,
        operateAsEnv: operateAs ?? null,
        operateAsCheck,
        session,
        hint: !ok
          ? operateAsCheck && !operateAsCheck.ok
            ? `operateAs "${operateAsTarget}" is blocked. Remove WIALON_OPERATE_AS and create a token directly for ${wialonUser ?? "the main account"}.`
            : "Token logs in but sees 0 units. Create WIALON_TOKEN for the main fleet account (brokinvest), not brokinvest_api."
          : undefined,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "Unknown error";
  console.error(message);
  process.exitCode = 1;
});
