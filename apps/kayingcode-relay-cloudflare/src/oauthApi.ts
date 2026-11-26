import type { RelayCloudflareEnv } from "./contract.js";

const INIT_PATH = "/api/v1/oauth/cli/init";
const POLL_PREFIX = "/api/v1/oauth/cli/poll/";
const PROFILE_PATH = "/api/v1/oauth/profile";

const NO_STORE_HEADERS = {
  "cache-control": "no-store",
  "content-type": "application/json; charset=utf-8",
};

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: NO_STORE_HEADERS });
}

function mode(env: RelayCloudflareEnv): string | null {
  const value = env.KAYINGCODE_API_MODE?.trim().toLowerCase();
  return value === "mock" || value === "proxy" ? value : null;
}

function mockInit(): Response {
  const now = Math.floor(Date.now() / 1_000);
  return json({
    code: 0,
    data: {
      authorize_url: "https://kayingcode-relay.local/mock/oauth/authorize",
      expires_at: now + 300,
      flow_id: "mock-flow",
      poll_interval_sec: 1,
      server_time: now,
    },
  });
}

function mockPoll(flowId: string): Response {
  if (!flowId) return json({ code: 400, msg: "missing flow id" }, 400);
  return json({
    code: 0,
    data: {
      status: "ready",
      token: "mock-kayingcode-jwt",
      user: { user_id: "mock-user", name: "Mock User", email: "mock@example.invalid" },
      providerId: "zai",
      accessToken: "mock-access-token",
    },
  });
}

function mockProfile(): Response {
  return json({
    code: 0,
    data: {
      user_id: "mock-user",
      name: "Mock User",
      email: "mock@example.invalid",
    },
  });
}

/**
 * OAuth CLI mock 路由。仅 `mock` 模式开放；OAuth 不允许经 Relay proxy，
 * 避免 Relay 看到真实授权码或 token。
 */
export async function handleOAuthApi(
  request: Request,
  env: RelayCloudflareEnv,
): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  const isInit = path === INIT_PATH;
  const isPoll = path.startsWith(POLL_PREFIX);
  const isProfile = path === PROFILE_PATH;
  if (!isInit && !isPoll && !isProfile) return null;

  if (mode(env) !== "mock") {
    return json({ error: "oauth_mock_disabled" }, 404);
  }

  if (isInit) {
    if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    return mockInit();
  }
  if (isPoll) {
    if (request.method !== "GET") return json({ error: "method_not_allowed" }, 405);
    return mockPoll(decodeURIComponent(path.slice(POLL_PREFIX.length)));
  }
  if (request.method !== "GET") return json({ error: "method_not_allowed" }, 405);
  return mockProfile();
}
