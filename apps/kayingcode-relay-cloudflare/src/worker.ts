import type { RelayCloudflareEnv } from "./contract.js";
import { mobileWebAssetsResponse } from "./mobileWebAssets.js";

export default {
  async fetch(request: Request, env: RelayCloudflareEnv): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (path === "/healthz" && request.method === "GET") return Response.json({ ok: true });
    if (path === "/readyz" || path.startsWith("/api/v1/remote/") || path.startsWith("/api/v1/account/")) {
      return env.WEB_REMOTE.get(env.WEB_REMOTE.idFromName("upstream-v2")).fetch(request);
    }
    // 旧 /v1 和 admin 不再进入任何 Relay；静态路径由资源层精确判断。
    return await mobileWebAssetsResponse(request, env) ?? new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<RelayCloudflareEnv>;
