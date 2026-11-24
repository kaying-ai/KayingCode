import { KAYINGCODE_CUA_OFFICIAL_PLUGIN_ID, KAYINGCODE_PLUGIN_ID_ENV_KEY } from "@zcode/shared";
import { registerMcpTools, traceContextToLogContext } from "../deps.js";
import type {
  McpConnectionSnapshot,
  McpServerConfig,
  TraceContext,
} from "../deps.js";
import type { AgentRuntimeInternal } from "../internal.js";
import type {
  McpToolDescriptor,
  PluginReferenceCatalog,
  WaitForMcpServersOutput,
} from "@zcode/contracts";
import type { McpServerWaitPort } from "../../tool/types.js";
import {
  classifyServer,
  type McpServerClass,
} from "../../mcp/runtime/session.js";
import { toMcpToolName, toModelVisibleMcpNamePart } from "../../mcp/name.js";

const MCP_SESSION_OAUTH_AUTHORIZATION_TIMEOUT_MS = 15_000;

export async function refreshWorkspaceTrustAdmission(
  runtime: AgentRuntimeInternal,
  traceContext: TraceContext,
): Promise<void> {
  try {
    await runtime.mcpPort?.refreshWorkspaceTrustAdmission?.();
  } catch (error) {
    // 提示发布失败不能阻断普通聊天；执行权限仍由 MCP gate 独立检查。
    runtime.logger?.warn("MCP trust admission publication failed", {
      ...traceContextToLogContext(traceContext),
      event: "mcp.trust.admission.failed",
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * 只有同时携带 resolver 注入的官方 plugin id 和本进程私有 authority 的 server 才能共享
 * Computer Use 项目授权。server 名、tool 名和 manifest env 都可被第三方仿造，不能单独作为信任依据。
 */
/** 官方权限组只接受 bootstrap 从内存插件注册表生成的可信集合；不按工具名称或 manifest env 自行授权。 */
export function computeOfficialCuaServerNames(
  servers: Record<string, McpServerConfig>,
  trustedServerNames: ReadonlySet<string>,
): Set<string> {
  const names = new Set<string>();

  for (const [name, config] of Object.entries(servers)) {
    if (!trustedServerNames.has(name)) continue;
    if (config.type !== "stdio") continue;
    if (
      config.env?.[KAYINGCODE_PLUGIN_ID_ENV_KEY]?.trim().toLowerCase() !==
      KAYINGCODE_CUA_OFFICIAL_PLUGIN_ID
    ) {
      continue;
    }
    names.add(name);
  }
  return names;
}

const MCP_SERVER_WAIT_MS = 5_000;

function matchesMcpServerName(serverName: string, requested: string): boolean {
  const part = toModelVisibleMcpNamePart(requested);
  return serverName === requested || toModelVisibleMcpNamePart(serverName) === part;
}

/**
 * WaitForMcpServers 的运行时端口：目标只按名称匹配；没有指定时取全部 pending，
 * 没有 pending 时报告失败的 server。只等已有启动任务（≤5s），不发起连接或授权。
 */
export function createMcpServerWaitPort(runtime: AgentRuntimeInternal): McpServerWaitPort {
  return {
    async waitForServers(servers, signal): Promise<WaitForMcpServersOutput> {
      const mcpPort = runtime.mcpPort;
      if (!mcpPort) {
        const unknown = [...(servers ?? [])];
        return {
          ready: unknown.length === 0,
          connected: [],
          failed: [],
          stillPending: [],
          needsAuth: [],
          disabled: [],
          unknown,
          isError: unknown.length > 0,
        };
      }
      const initial = mcpPort.getToolSnapshot();
      const names = [
        ...new Set([...Object.keys(runtime.config.mcp?.servers ?? {}), ...Object.keys(initial)]),
      ];
      const classOf = (name: string) =>
        classifyServer(runtime.config.mcp ?? {}, name, initial[name]?.status);
      const requested = servers?.length ? servers : undefined;
      const pending = names.filter((name) => classOf(name) === "pending");
      const targets = requested
        ? names.filter((name) => requested.some((value) => matchesMcpServerName(name, value)))
        : pending.length
          ? pending
          : names.filter((name) => classOf(name) === "failed");
      await Promise.all(
        targets
          .filter((name) => pending.includes(name))
          .map((name) => mcpPort.waitForServer?.(name, { timeoutMs: MCP_SERVER_WAIT_MS, signal })),
      );
      const current = mcpPort.getToolSnapshot();
      const result = {
        connected: [] as string[],
        failed: [] as string[],
        stillPending: [] as string[],
        needsAuth: [] as string[],
        disabled: [] as string[],
        unknown: [] as string[],
      };
      const groupOf: Record<McpServerClass, string[]> = {
        connected: result.connected,
        pending: result.stillPending,
        needs_auth: result.needsAuth,
        disabled: result.disabled,
        not_configured: result.unknown,
        // 没有连接记录的已配置 server 归入失败。
        absent: result.failed,
        failed: result.failed,
      };
      for (const name of targets) {
        groupOf[classifyServer(runtime.config.mcp ?? {}, name, current[name]?.status)].push(name);
      }
      for (const value of requested ?? []) {
        if (!targets.some((name) => matchesMcpServerName(name, value))) result.unknown.push(value);
      }
      const ready =
        result.stillPending.length +
          result.failed.length +
          result.needsAuth.length +
          result.disabled.length +
          result.unknown.length ===
        0;
      return { ready, ...result, isError: !ready };
    },
  };
}

export function startMcpStartup(
  this: AgentRuntimeInternal,
  traceContext: TraceContext,
): Promise<McpConnectionSnapshot> | undefined {
  if (this.mcpInitialized) return this.mcpStartupPromise;
  this.mcpInitialized = true;

  if (!this.mcpPort || this.config.mcp?.enabled === false) {
    this.mcpToolsRegistered = true;
    return undefined;
  }

  const servers = this.config.mcp?.servers ?? {};
  if (Object.keys(servers).length === 0) {
    const startup = Promise.all([this.mcpPort.status(), this.mcpPort.listTools()])
      .then(([statuses, tools]) => ({ statuses, tools }))
      .catch((error) => {
        this.logger?.warn("MCP existing tool discovery failed", {
          ...traceContextToLogContext(traceContext),
          error: error instanceof Error ? error.message : String(error),
          event: "mcp.existing_tools.failed",
          module: "core.runtime",
          status: "failed",
        });
        return { statuses: {}, tools: [] };
      });
    this.mcpStartupPromise = this.trackResidencyBlockingWork(startup);
    return this.mcpStartupPromise;
  }

  const startedAt = Date.now();
  const startup = this.mcpPort
    .connectConfiguredServers(servers, {
      // authorization_code MCP 无人完成浏览器授权时，session 启动过去会等默认 5 分钟，
      // 导致模型请求迟迟不发出；session 只等 15s，授权入口由设置页 mcp/list 展示。
      signal: this.shutdownSignal,
      oauthAuthorizationTimeoutMs: MCP_SESSION_OAUTH_AUTHORIZATION_TIMEOUT_MS,
      trace: traceContext,
      workingDirectory: this.workingDirectory,
      workspaceIdentity: this.config.workspaceIdentity?.toString(),
    })
    .then((snapshot) => {
      const statusCounts = Object.values(snapshot.statuses).reduce<Record<string, number>>(
        (counts, status) => {
          counts[status.status] = (counts[status.status] ?? 0) + 1;
          return counts;
        },
        {},
      );
      this.logger?.info("MCP startup completed", {
        ...traceContextToLogContext(traceContext),
        durationMs: Date.now() - startedAt,
        event: "mcp.startup.completed",
        module: "core.runtime",
        serverCount: Object.keys(servers).length,
        status: "completed",
        statusCounts,
        toolCount: snapshot.tools.length,
      });
      return snapshot;
    })
    .catch((error) => {
      this.logger?.warn("MCP startup failed", {
        ...traceContextToLogContext(traceContext),
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
        event: "mcp.startup.failed",
        module: "core.runtime",
        status: "failed",
      });
      return { statuses: {}, tools: [] };
    });
  this.mcpStartupPromise = this.trackResidencyBlockingWork(startup);
  this.logger?.debug("MCP startup scheduled", {
    ...traceContextToLogContext(traceContext),
    event: "mcp.startup.scheduled",
    module: "core.runtime",
    serverCount: Object.keys(servers).length,
    status: "started",
  });
  return this.mcpStartupPromise;
}

/**
 * 实时配置源变化：更新会话配置，按新 server map 重连，再按新工具表重注册。
 * 只在首次 MCP 初始化之后生效；初始化前的变化由 startMcpStartup 读取最新 config。
 */
export async function reconcileMcpConfiguration(
  this: AgentRuntimeInternal,
  traceContext: TraceContext,
): Promise<void> {
  const source = this.mcpConfigurationSource;
  const mcpPort = this.mcpPort;
  if (!source || !mcpPort || this.shuttingDown) return;
  const generation = ++this.mcpConfigurationGeneration;
  const snapshot = source.getSnapshot();
  this.config.mcp = snapshot;
  if (this.mcpToolCatalogPort) {
    // 配置变化后 server 集合与 cache key 都会变；重新 prepare 才能命中新 server。
    this.mcpCatalogPublication = this.mcpToolCatalogPort.prepare({
      servers: snapshot.servers ?? {},
      workingDirectory: this.workingDirectory,
      workspaceIdentity: this.config.workspaceIdentity?.toString(),
    });
  }
  if (!this.mcpInitialized) return;
  const servers = snapshot.enabled === false ? {} : (snapshot.servers ?? {});
  try {
    await mcpPort.connectConfiguredServers(servers, {
      signal: this.shutdownSignal,
      oauthAuthorizationTimeoutMs: MCP_SESSION_OAUTH_AUTHORIZATION_TIMEOUT_MS,
      trace: traceContext,
      workingDirectory: this.workingDirectory,
      workspaceIdentity: this.config.workspaceIdentity?.toString(),
    });
  } catch (error) {
    this.logger?.warn("MCP configuration reconnect failed", {
      ...traceContextToLogContext(traceContext),
      error: error instanceof Error ? error.message : String(error),
      event: "mcp.configuration.reconnect.failed",
      module: "core.runtime",
      status: "failed",
    });
    return;
  }
  // 迟到的 reconcile 不能覆盖更新一代的连接与工具表。
  if (this.shuttingDown || generation !== this.mcpConfigurationGeneration) return;
  this.mcpCatalogPublication?.publish(mcpPort.getToolSnapshot());
  if (!this.mcpToolsRegistered) return;
  // 强制下一次刷新读取当前端口目录；签名不变时 refresh 不会重注册。
  this.mcpToolListRevision = -1;
  await this.refreshMcpToolsIfChanged(traceContext);
}

export async function initializeMcp(
  this: AgentRuntimeInternal,
  traceContext: TraceContext,
): Promise<void> {  if (this.mcpToolsRegistered) return;

  const startup = this.startMcpStartup(traceContext);
  const mcpPort = this.mcpPort;
  if (!startup || !mcpPort) {
    this.mcpToolsRegistered = true;
    return;
  }
  const serverCount = Object.keys(this.config.mcp?.servers ?? {}).length;

  try {
    await refreshWorkspaceTrustAdmission(this, traceContext);
    const snapshot = await startup;
    this.shutdownSignal.throwIfAborted();
    this.mcpCatalogPublication?.publish(mcpPort.getToolSnapshot());
    const liveNames = new Set(snapshot.tools.map(toMcpToolName));
    const catalogTools = Object.entries(this.mcpCatalogPublication?.lookup.byServer ?? {}).flatMap(
      ([serverName, tools]) =>
        tools.map((tool) => ({ ...tool, serverName, catalogOnly: true as const })),
    );
    const descriptors = [
      ...snapshot.tools,
      ...catalogTools.filter((tool) => !liveNames.has(toMcpToolName(tool))),
    ];
    const registered = registerMcpTools(this.registry, mcpPort, descriptors, {
      allowedTools: this.config.toolAllowlist,
      disallowedTools: this.config.toolDisallowlist,
      officialCuaServerNames: computeOfficialCuaServerNames(
        this.config.mcp?.servers ?? {},
        new Set(this.config.mcp?.trustedOfficialCuaServerNames ?? []),
      ),
      // 插件 UI：display.ui 需要 server → pluginId 的归属；catalog 是 session 冻结的唯一权威。
      pluginIdByServerName: buildPluginIdByServerName(this.config.pluginReferenceCatalog),
    });
    if (registered.length > 0) {
      this.invalidateToolCache();
    }
    // A7：记住注册集合与签名，回合边界 refreshMcpToolsIfChanged 据此判断是否重注册。
    this.registeredMcpToolNames = registered;
    this.mcpToolsSignature = mcpToolsSignature(descriptors);
    this.mcpToolListRevision = mcpPort.toolListRevision?.();
    this.logger?.info("MCP tools registered", {
      ...traceContextToLogContext(traceContext),
      event: "mcp.tools.registered",
      module: "core.runtime",
      registeredToolCount: registered.length,
      serverCount,
      status: "completed",
    });
  } catch (error) {
    this.mcpToolsRegistered = true;
    this.logger?.warn("MCP initialization failed", {
      ...traceContextToLogContext(traceContext),
      error: error instanceof Error ? error.message : String(error),
      event: "mcp.initialization.failed",
      module: "core.runtime",
      status: "failed",
    });
  }
  this.mcpToolsRegistered = true;
}

/**
 * server 名 → 插件稳定 id。catalog 里 disabled 插件的 mcpServerNames 为空，天然不参与；
 * 同名冲突插件的 server 名互不相同（带插件名前缀），不需要额外去重。
 */
function buildPluginIdByServerName(
  catalog: PluginReferenceCatalog | undefined,
): ReadonlyMap<string, string> {
  const map = new Map<string, string>();
  for (const plugin of catalog?.plugins ?? []) {
    for (const serverName of plugin.mcpServerNames) map.set(serverName, plugin.pluginId);
  }
  return map;
}

function mcpToolsSignature(descriptors: readonly McpToolDescriptor[]): string {
  return descriptors
    .map((tool) => `${tool.serverName}\u0001${tool.toolName}\u0001${tool.description ?? ""}`)
    .sort()
    .join("\n");
}

/**
 * 回合开始前刷新 MCP 工具表。只有端口报告 tools/list_changed 计数变化时才重新 listTools
 * （adapter 对收到通知的 server 重拉），再比较工具签名，变了就注销旧的、注册新的并失效工具缓存。
 * 不实现 toolListRevision 的端口（mock / 静态 server）永远不刷新；回合内也不刷新（已拍板）。
 */
export async function refreshMcpToolsIfChanged(
  this: AgentRuntimeInternal,
  traceContext: TraceContext,
): Promise<void> {
  const mcpPort = this.mcpPort;
  if (!mcpPort || !this.mcpToolsRegistered) return;
  const revision = mcpPort.toolListRevision?.();
  if (revision === undefined || revision === this.mcpToolListRevision) return;
  let descriptors: McpToolDescriptor[];
  try {
    descriptors = await mcpPort.listTools();
  } catch {
    return;
  }
  this.mcpToolListRevision = revision;
  const signature = mcpToolsSignature(descriptors);
  if (this.mcpToolsSignature === signature) return;
  const previous = new Set(this.registeredMcpToolNames ?? []);
  for (const name of previous) this.registry.unregister(name);
  const registered = registerMcpTools(this.registry, mcpPort, descriptors, {
    allowedTools: this.config.toolAllowlist,
    disallowedTools: this.config.toolDisallowlist,
    officialCuaServerNames: computeOfficialCuaServerNames(
      this.config.mcp?.servers ?? {},
      new Set(this.config.mcp?.trustedOfficialCuaServerNames ?? []),
    ),
    pluginIdByServerName: buildPluginIdByServerName(this.config.pluginReferenceCatalog),
  });
  this.registeredMcpToolNames = registered;
  this.mcpToolsSignature = signature;
  this.invalidateToolCache();
  this.logger?.info("MCP tools re-registered after list_changed", {
    ...traceContextToLogContext(traceContext),
    event: "mcp.tools.reregistered",
    module: "core.runtime",
    removedToolCount: previous.size,
    registeredToolCount: registered.length,
    status: "completed",
  });
}
