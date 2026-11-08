import type {
  McpPort,
  McpServerConfig,
  McpServerStatus,
  McpStdioServerConfig,
} from "@zcode/contracts";
import {
  isKayingCodeCuaMcpCommand,
  isKayingCodeCuaMcpPackageArg,
  KAYINGCODE_CUA_OFFICIAL_PLUGIN_ID,
  KAYINGCODE_PLUGIN_ID_ENV_KEY,
} from "@zcode/shared";

const NODE_REPL_SERVER_NAME = "node_repl";

/**
 * Derive official CUA provenance from the in-memory plugin registry rather than
 * from serializable MCP fields. A user/project override replaces the config
 * object in `configuredServers`, so copied names, commands, and env values do
 * not inherit the bundled plugin's authority.
 */
export function resolveTrustedOfficialCuaServerNames(
  configuredServers: Record<string, McpServerConfig>,
  pluginServers: Record<string, McpServerConfig>,
): Set<string> {
  return new Set(
    Object.entries(pluginServers)
      .filter(
        ([name, config]) =>
          configuredServers[name] === config &&
          config.type === "stdio" &&
          config.env?.[KAYINGCODE_PLUGIN_ID_ENV_KEY]?.trim().toLowerCase() ===
            KAYINGCODE_CUA_OFFICIAL_PLUGIN_ID,
      )
      .map(([name]) => name),
  );
}

export async function listMcpServerStatuses(
  mcpPort: McpPort | undefined,
  servers: Record<string, McpServerConfig>,
  untrustedServerNames: ReadonlySet<string> = new Set(),
): Promise<Record<string, McpServerStatus>> {
  const liveStatuses = mcpPort ? await mcpPort.status() : {};
  const updatedAt = new Date().toISOString();
  const statuses: Record<string, McpServerStatus> = {};

  for (const [name, config] of Object.entries(servers)) {
    if (isRetiredCuaMcpServer(name, config)) continue;
    const configuredStatus = getConfiguredServerStatus(name, config, untrustedServerNames);
    statuses[name] = liveStatuses[name] ?? {
      status: configuredStatus,
      transport: config.type,
      toolCount: 0,
      updatedAt,
    };
  }

  for (const [name, status] of Object.entries(liveStatuses)) {
    if (!(name in statuses) && !isRetiredCuaMcpServer(name, servers[name])) statuses[name] = status;
  }

  return statuses;
}

export function omitMcpServers(
  servers: Record<string, McpServerConfig>,
  omittedNames: ReadonlySet<string>,
  trustedOfficialCuaServerNames: ReadonlySet<string> = new Set(),
): Record<string, McpServerConfig> {
  const kept = Object.fromEntries(
    Object.entries(servers).filter(
      ([name, config]) =>
        !omittedNames.has(name) &&
        !isRetiredCuaMcpServer(name, config, trustedOfficialCuaServerNames),
    ),
  );

  return kept;
}

function isKayingCodeCuaStdioServer(
  name: string,
  config: McpServerConfig,
): config is McpStdioServerConfig {
  if (config.type !== "stdio") return false;
  if (name === "computer-use") return true;
  if (isKayingCodeCuaMcpCommand(config.command)) return true;
  return (config.args ?? []).some(isKayingCodeCuaMcpPackageArg);
}

function isRetiredCuaMcpServer(
  name: string,
  config: McpServerConfig | undefined,
  trustedOfficialCuaServerNames: ReadonlySet<string> = new Set(),
): boolean {
  if (!config || name === NODE_REPL_SERVER_NAME) return false;
  // 新版内置插件仍是独立 CUA stdio server；它的 authority 来自发现阶段的对象身份或宿主
  // 写入的官方 plugin id。只豁免这条可信路径，继续清理用户目录里的旧独立 CUA 配置，避免
  // 内置 runtime 与历史全局 CLI 同时注册同名动作。
  if (
    trustedOfficialCuaServerNames.has(name) ||
    (config.type === "stdio" &&
      config.env?.[KAYINGCODE_PLUGIN_ID_ENV_KEY]?.trim().toLowerCase() ===
        KAYINGCODE_CUA_OFFICIAL_PLUGIN_ID)
  ) {
    return false;
  }
  return isKayingCodeCuaStdioServer(name, config);
}

function getConfiguredServerStatus(
  name: string,
  config: McpServerConfig,
  untrustedServerNames: ReadonlySet<string>,
): McpServerStatus["status"] {
  if (config.enabled === false) return "disabled";
  return untrustedServerNames.has(name) ? "untrusted" : "disconnected";
}
