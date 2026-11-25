import { KAYINGCODE_CUA_OFFICIAL_PLUGIN_ID, KAYINGCODE_PLUGIN_ID_ENV_KEY } from "@zcode/shared";
import { registerMcpTools, traceContextToLogContext } from "../deps.js";
import type {
  McpConnectionSnapshot,
  McpServerConfig,
  TraceContext,
} from "../deps.js";
import type { AgentRuntimeInternal } from "../internal.js";
import type {
  McpToolDefinition,
  PluginReferenceCatalog,
  WaitForMcpServersOutput,
} from "@zcode/contracts";
import type { McpServerWaitPort } from "../../tool/types.js";
import {
  classifyServer,
  type McpServerClass,
  type McpSessionView,
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

  const session = this.mcpSession;
  if (!session) {
    this.mcpToolsRegistered = true;
    return undefined;
  }

  const serverCount = Object.keys(this.config.mcp?.servers ?? {}).length;
  const startedAt = Date.now();
  const startup = session
    .start()
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
        serverCount,
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
  this.mcpStartupPromise = startup;
  this.logger?.debug("MCP startup scheduled", {
    ...traceContextToLogContext(traceContext),
    event: "mcp.startup.scheduled",
    module: "core.runtime",
    serverCount,
    status: "started",
  });
  return this.mcpStartupPromise;
}

/**
 * 配置源发布后同步 runtime 的配置视图，再把最新配置交给 mcpSession 收敛连接与目录。
 * 订阅只有这一个入口；session 的 generation 保证迟到的 reconcile 不会覆盖新一代连接。
 */
export async function reconcileMcpConfiguration(
  this: AgentRuntimeInternal,
  _traceContext: TraceContext,
): Promise<void> {
  const source = this.mcpConfigurationSource;
  if (!source || this.shuttingDown) return;
  const snapshot = source.getSnapshot();
  this.config.mcp = snapshot;
  await this.mcpSession?.reconcileConfiguration(snapshot);
}

/**
 * 普通 step 的工具面只由 session 视图投影：view.tools 是 live 目录与目录缓存的唯一合并结果，
 * 注册签名不变时不重注册，恢复/续写请求因而沿用原工具列表。
 */
export async function initializeMcp(
  this: AgentRuntimeInternal,
  traceContext: TraceContext,
  options: { background?: boolean } = {},
): Promise<McpSessionView | undefined> {
  const session = this.mcpSession;
  const mcpPort = this.mcpPort;
  if (!session || !mcpPort) {
    this.mcpToolsRegistered = true;
    return undefined;
  }
  // 首输入的准入读取随首次初始化完成；修复前改为每步准备视图后漏掉了这次读取，
  // 工作区待审核提示要等第二条输入才出现。之后的读取由 turn / steering 的真实新输入触发。
  if (!this.mcpTrustAdmissionRead) {
    this.mcpTrustAdmissionRead = true;
    await refreshWorkspaceTrustAdmission(this, traceContext);
  }

  try {
    await session.prepare(options.background === true);
    if (this.shuttingDown) return undefined;
    const view = session.read();
    const liveNames = new Set(view.tools.map(toMcpToolName));
    // 产品差异：目录缓存里的展示定义也进 provider 工具面（catalogOnly），保证断线/授权期间
    // 工具仍然可见，执行时由 resolveForExecution 解析回 live 定义。
    const catalogTools = Object.entries(session.publication?.lookup.byServer ?? {}).flatMap(
      ([serverName, tools]): McpToolDefinition[] =>
        tools.map((tool) => ({ ...tool, serverName, catalogOnly: true })),
    );
    const descriptors: McpToolDefinition[] = [
      ...view.tools,
      ...catalogTools.filter((tool) => !liveNames.has(toMcpToolName(tool))),
    ];
    const officialCuaServerNames = computeOfficialCuaServerNames(
      view.configuration.servers ?? {},
      new Set(view.configuration.trustedOfficialCuaServerNames ?? []),
    );
    // 官方 CUA 授权集合变化会改变模型可见名称与权限能力组，必须进入注册签名。
    const signature = mcpToolsSignature(descriptors, officialCuaServerNames);
    this.mcpToolsRegistered = true;
    if (signature === this.mcpToolsSignature) return view;

    // 单写路径：先撤销上一代注册，再整体注册本次视图；不保留额外的增量注册通道。
    for (const name of this.registeredMcpToolNames ?? []) this.registry.unregister(name);
    const registered = registerMcpTools(this.registry, mcpPort, descriptors, {
      allowedTools: this.config.toolAllowlist,
      disallowedTools: this.config.toolDisallowlist,
      officialCuaServerNames,
      // 插件 UI：display.ui 需要 server → pluginId 的归属；catalog 是 session 冻结的唯一权威。
      pluginIdByServerName: buildPluginIdByServerName(this.config.pluginReferenceCatalog),
      // 执行期晚绑定当前连接：配置未变、server 已连接且仍提供该工具时才允许调用。
      resolveLiveDescriptor: (descriptor, signal) => session.resolve(descriptor, signal),
    });
    this.registeredMcpToolNames = registered;
    this.mcpToolsSignature = signature;
    if (registered.length > 0) {
      this.invalidateToolCache();
    }
    this.logger?.info("MCP tools registered", {
      ...traceContextToLogContext(traceContext),
      event: "mcp.tools.registered",
      module: "core.runtime",
      registeredToolCount: registered.length,
      serverCount: Object.keys(view.servers).length,
      status: "completed",
    });
    return view;
  } catch (error) {
    this.mcpToolsRegistered = true;
    this.logger?.warn("MCP initialization failed", {
      ...traceContextToLogContext(traceContext),
      error: error instanceof Error ? error.message : String(error),
      event: "mcp.initialization.failed",
      module: "core.runtime",
      status: "failed",
    });
    return undefined;
  }
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

function mcpToolsSignature(
  descriptors: readonly McpToolDefinition[],
  officialCuaServerNames: ReadonlySet<string>,
): string {
  return [
    `official:${[...officialCuaServerNames].sort().join(",")}`,
    ...descriptors
      // 名称不变的 schema、权限注解和暴露策略变化同样必须替换定义。
      .map((tool) => JSON.stringify(tool))
      .sort(),
  ].join("\n");
}
