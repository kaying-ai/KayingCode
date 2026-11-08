/* eslint-disable max-lines -- HTTP、WebSocket 与静态资源路由集中注册，保持同一鉴权顺序。 */
import { readFile, stat } from "node:fs/promises";
import { basename, extname, relative, resolve, sep } from "node:path";
import { hostname } from "node:os";
import { Hono, type Context } from "hono";
import { serve } from "@hono/node-server";
import type { WebSocket } from "ws";
import {
  ServiceCollection,
  IFileService,
  IGitService,
  ISystemService,
  ITerminalService,
  IWindowControllerService,
} from "@zcode/services";
import { createAgentGateway } from "@kayingcode/agent-gateway";
import {
  formatLogPrefix,
  formatZodError,
  buildRemoteAgentWorkspaceIdentity,
  remoteTargetSchema,
  SERVER_REMOTE_PROTOCOL_VERSION,
  KAYINGCODE_VERSION,
  type ServerRemoteInfo,
  type ServerRemoteWorkspaceInfo,
} from "@zcode/shared";
import { connectRemote, createRemoteBackend, type RemoteConnection } from "./remote/index.js";
import { createUnavailableWindowControllerService } from "./windowControllerUnavailable.js";

const log = (...args: unknown[]) =>
  console.log(formatLogPrefix("kayingcode-server:http", process.pid), ...args);

/** 存储 web 模式下的远程连接，key 为随机 ID */
const remoteConnections = new Map<string, RemoteConnection>();

function generateId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

interface HttpServerOptions {
  serverId?: string;
  name?: string;
  host?: string;
  authRequired?: boolean;
  authToken?: string;
  spaFallback?: boolean;
  staticRoot?: string;
  workspaces?: ServerRemoteWorkspaceInfo[];

}

function readTrimmedEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function resolveServerId(options: HttpServerOptions): string {
  return (
    options.serverId?.trim() ||
    readTrimmedEnv("KAYINGCODE_SERVER_ID") ||
    hostname() ||
    "kayingcode-server"
  );
}

/** workspace 事实同时供 server-info 与 relay ingress 使用。 */
export function resolveServerWorkspaces(options: HttpServerOptions): ServerRemoteWorkspaceInfo[] {
  if (options.workspaces) {
    return options.workspaces;
  }
  const workspacePath = readTrimmedEnv("KAYINGCODE_SERVER_WORKSPACE") || process.cwd();
  return [
    {
      workspaceId: "default",
      path: workspacePath,
      label: basename(workspacePath) || workspacePath,
      workspaceIdentity: buildRemoteAgentWorkspaceIdentity(
        resolveServerId(options),
        "default",
        workspacePath,
      ),
      access: "read-write",
    },
  ];
}

function createServerInfo(options: HttpServerOptions): ServerRemoteInfo {
  return {
    serverId: resolveServerId(options),
    instanceGeneration: 0,
    ...(options.name?.trim() || readTrimmedEnv("KAYINGCODE_SERVER_NAME")
      ? { name: options.name?.trim() || readTrimmedEnv("KAYINGCODE_SERVER_NAME") }
      : {}),
    version: KAYINGCODE_VERSION,
    protocolVersion: SERVER_REMOTE_PROTOCOL_VERSION,
    minimumClientProtocolVersion: SERVER_REMOTE_PROTOCOL_VERSION,
    authRequired: options.authRequired ?? Boolean(readTrimmedEnv("KAYINGCODE_SERVER_TOKEN")),
    auth: {
      methods:
        (options.authRequired ?? Boolean(readTrimmedEnv("KAYINGCODE_SERVER_TOKEN")))
          ? ["bearer-token"]
          : ["ssh-tunnel"],
      tlsRequired: false,
    },
    workspaces: resolveServerWorkspaces(options),
    capabilities: {
      desktopContinuous: true,
      trustedHostCapability: true,
      workspaceCatalog: true,
      conversationV4: true,
      attachmentChunkUpload: true,
      file: true,
      git: true,
      terminal: true,
      providerSettings: true,
      browserControl: false,
      cua: false,
      automationScheduler: false,
      websocketRpc: true,
      processResourceTelemetry: true,
    },
  };
}

const kayingcodeLiteTokenCookieName = "kayingcode_lite_token";

const staticMimeTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".wasm": "application/wasm",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function parseCookieHeader(header: string | undefined): Map<string, string> {
  const cookies = new Map<string, string>();
  if (!header) {
    return cookies;
  }
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator <= 0) {
      continue;
    }
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (name) {
      cookies.set(name, value);
    }
  }
  return cookies;
}

function hasValidLiteToken(c: Context, token: string): boolean {
  const url = new URL(c.req.url);
  if (url.searchParams.get("token") === token) {
    c.header(
      "Set-Cookie",
      `${kayingcodeLiteTokenCookieName}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax`,
    );
    return true;
  }
  return parseCookieHeader(c.req.header("cookie")).get(kayingcodeLiteTokenCookieName) === token;
}

function isTokenProtectedPath(pathname: string): boolean {
  return pathname === "/ws" || pathname.startsWith("/ws/") || pathname.startsWith("/api/");
}

function isStaticFallbackAllowed(pathname: string): boolean {
  return !isTokenProtectedPath(pathname);
}

function isInsideDirectory(root: string, candidate: string): boolean {
  const diff = relative(root, candidate);
  return diff === "" || (!diff.startsWith("..") && !diff.includes(`..${sep}`));
}

async function resolveStaticFile(
  staticRoot: string,
  pathname: string,
  spaFallback: boolean,
): Promise<string | null> {
  const root = resolve(staticRoot);
  const normalizedPathname = pathname === "/" ? "/index.html" : pathname;
  const relativePath = decodeURIComponent(normalizedPathname).replace(/^\/+/, "");
  let candidate = resolve(root, relativePath);
  if (!isInsideDirectory(root, candidate)) {
    return null;
  }

  try {
    const candidateStat = await stat(candidate);
    if (candidateStat.isDirectory()) {
      candidate = resolve(candidate, "index.html");
      if (!isInsideDirectory(root, candidate)) {
        return null;
      }
      const indexStat = await stat(candidate);
      return indexStat.isFile() ? candidate : null;
    }
    if (candidateStat.isFile()) {
      return candidate;
    }
  } catch {
    // 静态资源未命中时再进入 SPA fallback，保留真实文件错误的 404 语义。
  }

  if (!spaFallback || !isStaticFallbackAllowed(pathname)) {
    return null;
  }
  const indexFile = resolve(root, "index.html");
  try {
    const indexStat = await stat(indexFile);
    return indexStat.isFile() ? indexFile : null;
  } catch {
    return null;
  }
}

function staticContentType(filePath: string): string {
  return staticMimeTypes[extname(filePath).toLowerCase()] ?? "application/octet-stream";
}

export function createHttpServer(
  services: ServiceCollection,
  port = 3030,
  options: HttpServerOptions = {},
) {
  const app = new Hono();

  const authToken = options.authToken?.trim();
  if (authToken) {
    app.use("*", async (c, next) => {
      const pathname = new URL(c.req.url).pathname;
      const validToken = hasValidLiteToken(c, authToken);
      if (!isTokenProtectedPath(pathname) || validToken) {
        await next();
        return;
      }
      return c.json({ error: "Unauthorized" }, 401);
    });
  }

  // Web Host 没有窗口级 controller。必须显式注册 unavailable channel：未注册时
  // ProxyChannel 的 EventListen 会被 ChannelServer 挂起，UI 只能等超时；显式拒绝
  // 才能让侧栏走已有的降级/告警路径。
  if (!services.getOptional(IWindowControllerService)) {
    services.register(IWindowControllerService, createUnavailableWindowControllerService());
  }

  // WS/RPC ingress（/ws、/ws/host、capability、scope 生命周期）统一由 agent-gateway
  // 提供；本文件保留 Web Host 的部署策略：bearer token、静态资源、connect-remote 桥。
  // 必须在 token 中间件之后创建 gateway，保证鉴权顺序不变。
  const gateway = createAgentGateway({
    app,
    services,
    serverInfo: createServerInfo(options),
    connectionIdPrefix: "server-ws",
    logger: log,
  });

  // Web 模式下发起远程连接
  app.post("/api/connect-remote", async (c) => {
    const rawBody = await c.req.json();
    const parsedBody = remoteTargetSchema.safeParse(rawBody);
    if (!parsedBody.success) {
      return c.json({ error: `Invalid request body: ${formatZodError(parsedBody.error)}` }, 400);
    }
    const body = parsedBody.data;

    try {
      const backend = await createRemoteBackend(body);
      const connection = await connectRemote(backend);
      const id = generateId();
      remoteConnections.set(id, connection);

      return c.json({ id });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: message }, 500);
    }
  });

  // 远程连接的 WebSocket 端点，将远程 services 桥接给浏览器
  app.get(
    "/ws/remote/:id",
    gateway.upgradeWebSocket((c) => {
      const id = c.req.param("id");
      return {
        onOpen(_event, ws) {
          if (!id) {
            ws.close(4000, "Missing remote connection id");
            return;
          }
          const connection = remoteConnections.get(id);
          if (!connection) {
            ws.close(4004, "Remote connection not found");
            return;
          }
          // 一个连接只给一个 WS 客户端使用，取出后从 Map 移除
          remoteConnections.delete(id);

          // 将远程 services 包装为 ServiceCollection，经 gateway 统一进入
          // exposeOnChannelServer（保持 clientMode→role 固定映射）
          const remoteServices = new ServiceCollection()
            .register(IFileService, connection.services.fileService)
            .register(IGitService, connection.services.gitService)
            .register(ISystemService, connection.services.systemService)
            .register(ITerminalService, connection.services.terminalService);

          gateway.attachWebSocket(ws.raw as WebSocket, {
            clientMode: "web-remote-replayable",
            services: remoteServices,
          });
        },
      };
    }),
  );

  if (options.staticRoot?.trim()) {
    const staticRoot = options.staticRoot.trim();
    app.get("*", async (c) => {
      const pathname = new URL(c.req.url).pathname;
      const filePath = await resolveStaticFile(staticRoot, pathname, options.spaFallback ?? true);
      if (!filePath) {
        return c.notFound();
      }
      return c.body(await readFile(filePath), 200, {
        "Cache-Control": filePath.endsWith("index.html")
          ? "no-cache"
          : "public, max-age=31536000, immutable",
        "Content-Type": staticContentType(filePath),
      });
    });
  }

  const server = serve({ fetch: app.fetch, hostname: options.host, port }, () => {
    const address = server.address();
    const listenPort = typeof address === "object" && address ? address.port : port;
    const listenHost = options.host?.trim() || "localhost";
    log(`http://${listenHost}:${listenPort}`);
  });

  gateway.injectWebSocket(server);

  return server;
}
