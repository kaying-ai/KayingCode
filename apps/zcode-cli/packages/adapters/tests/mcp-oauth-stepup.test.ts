// 调用期 401：只发起一次授权恢复（Phase 2 → 一次重试），失败按 oauth_authorization_failed
// 分类并保留目录；授权链接发布后本次调用立即结束，不占满工具预算，也不重放调用。
// MCP server 与授权服务器都用真实 HTTP 端点。
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { createMcpAdapter } from "../src/mcp/index.js";
import { createSharedKayingCodeCredentialStore } from "../src/auth/shared-credentials.js";

const roots: string[] = [];
const servers: Server[] = [];

afterEach(async () => {
  for (const server of servers.splice(0))
    await new Promise<void>((resolve) => server.close(() => resolve()));
  for (const root of roots.splice(0))
    // close() 之后后台授权事务还会删除 pending 登记与锁目录；重试避免 ENOTEMPTY。
    await rm(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 });
});

const TOOL = { name: "search", description: "remote search", inputSchema: { type: "object" } };

function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
}

/**
 * 授权服务器端点只在需要"链接发布"的场景启用：discovery → DCR 完成后 SDK 会给出授权 URL，
 * 适配器发布链接并等浏览器回调。这里不实现 /authorize 与 /token，避免真的完成授权。
 * DCR 响应必须回显注册的 metadata（RFC 7591 的 client information），SDK 会校验 redirect_uris。
 */
async function handleAuthorizationEndpoint(
  pathname: string,
  request: IncomingMessage,
  response: ServerResponse,
  origin: string,
): Promise<boolean> {
  if (pathname.startsWith("/.well-known/oauth-protected-resource")) {
    json(response, 200, {
      resource: `${origin}/mcp`,
      authorization_servers: [origin],
      bearer_methods_supported: ["header"],
    });
    return true;
  }
  if (pathname === "/.well-known/oauth-authorization-server") {
    json(response, 200, {
      issuer: origin,
      authorization_endpoint: `${origin}/authorize`,
      token_endpoint: `${origin}/token`,
      registration_endpoint: `${origin}/register`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
    });
    return true;
  }
  if (pathname === "/register" && request.method === "POST") {
    let body = "";
    for await (const chunk of request) body += chunk;
    const parsed = JSON.parse(body || "{}") as {
      client_metadata?: Record<string, unknown>;
    };
    json(response, 201, {
      ...(parsed.client_metadata ?? (parsed as Record<string, unknown>)),
      client_id: "step-up-test-client",
    });
    return true;
  }
  return false;
}

async function fixture(options: { authorizationServer?: boolean } = {}) {
  const root = await mkdtemp(join(tmpdir(), "kayingcode-mcp-stepup-"));
  roots.push(root);
  // 授权 lease 与凭据共用同一个域目录；不存在时 Phase 2 会在建锁前失败。
  await mkdir(join(root, ".kayingcode/v2"), { recursive: true });
  const state = { authorizationProbes: 0, locked: false, toolCalls: 0 };
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (url.pathname !== "/mcp") {
      state.authorizationProbes += 1;
      if (
        options.authorizationServer &&
        (await handleAuthorizationEndpoint(url.pathname, request, response, origin))
      )
        return;
      response.writeHead(404, { "content-type": "text/plain" }).end("not found");
      return;
    }
    if (request.method === "GET") {
      // 只实现 POST 的有状态 server：事件流不可用不代表会话失效。
      response.writeHead(405).end();
      return;
    }
    let body = "";
    for await (const chunk of request) body += chunk;
    const message = JSON.parse(body || "{}") as { id?: unknown; method?: string };
    if (message.id === undefined || message.method?.startsWith("notifications/")) {
      response.writeHead(202).end();
      return;
    }
    if (message.method === "tools/call") {
      state.toolCalls += 1;
      // 之后的握手也要求授权：真实 OAuth server 在令牌失效后不会继续放行 initialize。
      state.locked = true;
    }
    if (state.locked) {
      response
        .writeHead(401, {
          "content-type": "application/json",
          "www-authenticate": `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource"`,
        })
        .end(JSON.stringify({ error: "unauthorized" }));
      return;
    }
    const result =
      message.method === "initialize"
        ? {
            protocolVersion: "2025-06-18",
            capabilities: { tools: {} },
            serverInfo: { name: "step-up-test", version: "1" },
          }
        : message.method === "tools/list"
          ? { tools: [TOOL] }
          : {};
    response
      .writeHead(200, { "content-type": "application/json" })
      .end(JSON.stringify({ jsonrpc: "2.0", id: message.id, result }));
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("HTTP fixture did not bind");
  const origin = `http://127.0.0.1:${address.port}`;
  const credentialStore = createSharedKayingCodeCredentialStore({
    baseDir: root,
    cipher: {
      async decrypt(value: string) {
        return value.startsWith("v2:") ? value.slice(3) : value;
      },
      async encrypt(value: string) {
        return `v2:${value}`;
      },
    },
  });
  return {
    config: {
      type: "http" as const,
      url: `${origin}/mcp`,
      protocolVersion: "legacy" as const,
    },
    createAdapter: () => createMcpAdapter({ mcpOAuth: { credentialStore } }),
    state,
  };
}

it("performs one authorization step-up on a tool-call 401 and keeps the catalog for retry", async () => {
  const f = await fixture();
  const adapter = f.createAdapter();
  try {
    const connected = await adapter.connectServer("remote", f.config);
    expect(connected.status).toBe("connected");
    expect(adapter.getToolSnapshot!().remote?.tools?.map((tool) => tool.toolName)).toEqual([
      "search",
    ]);

    await expect(
      adapter.callTool({ serverName: "remote", toolName: "search" }),
    ).rejects.toBeDefined();
    // 一次调用只对应一次 401 尝试；授权失败不重放工具调用。
    const callsAfterFailure = f.state.toolCalls;
    expect(callsAfterFailure).toBeLessThanOrEqual(2);
    expect(f.state.authorizationProbes).toBeGreaterThan(0);

    const snapshot = adapter.getToolSnapshot!().remote;
    expect(snapshot?.status).toMatchObject({
      status: "failed",
      failureKind: "oauth_authorization_failed",
    });
    // 授权未完成就结束时保留最后有效目录：执行准入仍有入口重连与重新授权。
    expect(snapshot?.tools?.map((tool) => tool.toolName)).toEqual(["search"]);
    expect(snapshot?.toolsVersion).toBeTruthy();

    // reauthorize 入口只重连一次，不再重放已失败的调用。
    const probesBefore = f.state.authorizationProbes;
    await adapter.waitForServer!("remote", {
      reconnect: true,
      reauthorize: true,
      timeoutMs: 3_000,
    });
    expect(f.state.toolCalls).toBe(callsAfterFailure);
    expect(f.state.authorizationProbes).toBeGreaterThan(probesBefore);
    const reconnected = adapter.getToolSnapshot!().remote;
    expect(reconnected?.status.failureKind).toBe("oauth_authorization_failed");
    expect(reconnected?.tools?.map((tool) => tool.toolName)).toEqual(["search"]);
  } finally {
    await adapter.close();
  }
});

it("ends the call as soon as the authorization link is published instead of using the tool budget", async () => {
  const f = await fixture({ authorizationServer: true });
  const adapter = f.createAdapter();
  try {
    await adapter.connectServer("remote", f.config);
    const startedAt = Date.now();
    await expect(
      adapter.callTool({ serverName: "remote", toolName: "search" }),
    ).rejects.toBeDefined();
    // 链接发布即结束本次调用；默认工具预算 30s，这里必须远低于它。
    expect(Date.now() - startedAt).toBeLessThan(5_000);
    expect(f.state.toolCalls).toBeLessThanOrEqual(2);

    // 等待方看到 connecting + authorization：core 据此改写为 needs-auth 提示。
    const snapshot = adapter.getToolSnapshot!().remote;
    expect(snapshot?.status.status).toBe("connecting");
    expect(snapshot?.status.authorization?.authorizationUrl).toContain("/authorize");
    // 目录仍在视图里，下一次执行准入仍可重新授权。
    expect(snapshot?.tools?.map((tool) => tool.toolName)).toEqual(["search"]);
  } finally {
    // close 会中止后台授权事务并关闭 callback listener。
    await adapter.close();
  }
});
