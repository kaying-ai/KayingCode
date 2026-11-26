import { localClientScenesDefaults } from "@zcode/shared";
import type { RelayCloudflareEnv } from "./contract.js";

/** 只开放精确的公开客户端 API 路径；不提供通用代理。 */
const CLIENT_API_PATHS = new Set(["/api/v1/client/configs", "/api/v1/client/scenes"]);

const NO_STORE_HEADERS = {
  "cache-control": "no-store",
  "content-type": "application/json; charset=utf-8",
};

type ClientApiMode = "mock" | "proxy";

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: NO_STORE_HEADERS });
}

function resolveMode(env: RelayCloudflareEnv): ClientApiMode | null {
  const mode = env.KAYINGCODE_API_MODE?.trim().toLowerCase();
  return mode === "mock" || mode === "proxy" ? mode : null;
}

function resolveUpstreamOrigin(env: RelayCloudflareEnv): URL | null {
  const raw = env.KAYINGCODE_API_UPSTREAM_ORIGIN?.trim();
  if (!raw) return null;
  try {
    const origin = new URL(raw);
    if (origin.protocol !== "https:" || origin.username || origin.password) return null;
    if (origin.pathname !== "/" || origin.search || origin.hash) return null;
    return origin;
  } catch {
    return null;
  }
}

function mockResponse(path: string): Response {
  if (path === "/api/v1/client/configs") {
    // 与 localrun 同源缺省：不下发任何 configs key，由客户端各自 fail-close。
    return json({ code: 0, data: { configs: {} } });
  }
  return json(localClientScenesDefaults());
}

function proxyResponse(upstream: URL, request: Request, fetchImpl: typeof fetch): Promise<Response> {
  const source = new URL(request.url);
  const target = new URL(source.pathname + source.search, upstream);
  return fetchImpl(target, {
    method: "GET",
    // 公开配置不需要凭据；不转发 Authorization/Cookie，避免 Relay 成为凭据代理。
    headers: { accept: request.headers.get("accept") ?? "application/json" },
    redirect: "manual",
  }).then((response) => {
    const headers = new Headers();
    for (const key of ["content-type", "etag", "last-modified"]) {
      const value = response.headers.get(key);
      if (value) headers.set(key, value);
    }
    headers.set("cache-control", "no-store");
    return new Response(response.body, { status: response.status, headers });
  });
}

/**
 * 处理 `/api/v1/client/*` 的 mock/proxy 请求。
 * 返回 null 表示不是本模块负责的路径，交给现有 Relay/静态资源逻辑。
 */
export async function handleClientApi(
  request: Request,
  env: RelayCloudflareEnv,
  fetchImpl: typeof fetch = fetch,
): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  if (!CLIENT_API_PATHS.has(path)) return null;
  if (request.method !== "GET") return json({ error: "method_not_allowed" }, 405);

  const mode = resolveMode(env);
  if (mode === "mock") return mockResponse(path);
  if (mode === "proxy") {
    const upstream = resolveUpstreamOrigin(env);
    if (!upstream) return json({ error: "upstream_origin_unavailable" }, 503);
    return proxyResponse(upstream, request, fetchImpl);
  }
  return new Response("Not found", { status: 404 });
}
