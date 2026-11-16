import { isAllowedTapTapPath, isAuthorizedBearer } from "./policy.js";

export interface Env {
  PROXY_TOKEN?: string;
  /** Optional defense in depth: only accept requests from this CF-Connecting-IP. */
  ALLOWED_CLIENT_IP?: string;
}

const TAPTAP_ORIGIN = "https://www.taptap.cn";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function refererFor(pathname: string): string {
  return pathname.startsWith("/webapiv2/calendar/")
    ? "https://www.taptap.cn/app-calendar"
    : "https://www.taptap.cn/top/download";
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return json({ ok: true, service: "kaying-taptap-proxy" });
    }
    if (url.pathname !== "/fetch") {
      return json({ error: "not_found" }, 404);
    }
    if (request.method !== "GET") {
      return json({ error: "method_not_allowed" }, 405);
    }
    if (!env.PROXY_TOKEN) {
      return json({ error: "proxy_token_not_configured" }, 500);
    }
    if (!isAuthorizedBearer(request.headers.get("authorization"), env.PROXY_TOKEN)) {
      return json({ error: "unauthorized" }, 401);
    }
    if (env.ALLOWED_CLIENT_IP) {
      const clientIp = request.headers.get("cf-connecting-ip");
      if (clientIp !== env.ALLOWED_CLIENT_IP) {
        return json({ error: "client_ip_not_allowed" }, 403);
      }
    }

    const path = url.searchParams.get("path") ?? "";
    if (!isAllowedTapTapPath(path)) {
      return json({ error: "path_not_allowed" }, 400);
    }

    const target = new URL(TAPTAP_ORIGIN + path);
    try {
      const upstream = await fetch(target.toString(), {
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "application/json",
          "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
          Referer: refererFor(target.pathname),
        },
      });
      const body = await upstream.text();
      return new Response(body, {
        status: upstream.status,
        headers: {
          "content-type": upstream.headers.get("content-type") ?? "application/json; charset=utf-8",
          "cache-control": "no-store",
          "x-upstream-status": String(upstream.status),
          "x-proxy-version": "1",
        },
      });
    } catch (error) {
      return json(
        {
          error: "upstream_unreachable",
          message: error instanceof Error ? error.message : String(error),
        },
        502,
      );
    }
  },
};
