import { createConfig, resolvePath } from "@zcode/adapters/config";
import {
  KAYINGCODE_OFFICIAL_PLUGIN_MARKETPLACE,
  createRootTraceContext,
  type McpServerConfig,
} from "@zcode/contracts";
import {
  KAYINGCODE_PLUGIN_ID_ENV_KEY,
  TAPMAKER_PROJECTS_MCP_TOOL,
  tapMakerProjectsRequestSchema,
  tapMakerProjectsResultSchema,
} from "@zcode/shared";
import { getCliStorageRoot } from "../app/paths.js";
import { resolveStartupPlugins } from "../app/startup-marks.js";
import { StartupTimer, startupNow } from "../startup-logging.js";
import { parseParams, type KayingCodeProtocolAgentServerContext } from "./server-types.js";

const TAPMAKER_PLUGIN_ID = `kaying-for-taptap@${KAYINGCODE_OFFICIAL_PLUGIN_MARKETPLACE}`;
const TAPMAKER_SERVER_NAME = "plugin:kaying-for-taptap:kaying_for_taptap";

export function resolveTapMakerManagementServer(servers: Record<string, McpServerConfig>) {
  const config = servers[TAPMAKER_SERVER_NAME];
  // 原因：official 仅在 JWT auth 路径生成，普通 stdio 的内置 Maker 没有此字段。
  // 修复依据：source 和插件身份 env 都由 discovery 权威生成，不依赖插件自行声明鉴权。
  if (
    config?.type !== "stdio" ||
    config.enabled === false ||
    config.source?.kind !== "builtin" ||
    config.env?.[KAYINGCODE_PLUGIN_ID_ENV_KEY] !== TAPMAKER_PLUGIN_ID
  )
    return undefined;
  return [TAPMAKER_SERVER_NAME, config] as const;
}

export async function manageTapMakerProjects(
  context: KayingCodeProtocolAgentServerContext,
  rawParams: unknown,
  signal?: AbortSignal,
) {
  const params = parseParams(tapMakerProjectsRequestSchema, rawParams);
  const workingDirectory = context.deps.cwd ?? process.cwd();
  const logger = context.logger;
  if (!logger || !context.deps.mcpPort) throw new Error("TapMaker management runtime unavailable");
  const configResult = createConfig({ env: context.deps.env, workingDirectory });
  const outcome = resolveStartupPlugins({
    cliStorageRoot: getCliStorageRoot(resolvePath(configResult.config.storage.dir)),
    configResult,
    env: context.deps.env,
    logger,
    options: {},
    startupTimer: new StartupTimer(logger, { module: "tapmaker.projects" }, startupNow()),
    workingDirectory,
  });
  const entry = resolveTapMakerManagementServer(outcome.mcpServers);
  if (!entry)
    throw new Error("Install and enable the kaying-for-taptap plugin to use TapMaker projects.");
  const [serverName, config] = entry;
  const trace = createRootTraceContext({});
  const mcp = context.deps.mcpPort;
  // 单服务器连接保留管理 runtime 的其它 MCP lease，不以列表刷新替换全量连接。
  await mcp.connectServer(serverName, config, { workingDirectory, trace, signal });
  const result = await mcp.callTool(
    {
      serverName,
      toolName: TAPMAKER_PROJECTS_MCP_TOOL,
      arguments: params,
      trace,
      workspacePath: params.action === "restore" ? params.selectedDirectory : workingDirectory,
      clientMode: "tapmaker-management",
    },
    { signal, timeoutMs: 25 * 60_000 },
  );
  if (result.isError) {
    const message = result.content.find((item) => item.type === "text")?.text;
    throw new Error(typeof message === "string" ? message : "TapMaker operation failed");
  }
  return tapMakerProjectsResultSchema.parse(result.structuredContent);
}
