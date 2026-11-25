// Config Factory - Load and merge all config sources

import { readFile, realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";
import type {
  ConfigPort,
  HookConfigSource,
  LoggerFactory,
  McpServerConfig,
  RuntimeConfig,
  RuntimeConfigPatch,
  WorkspaceHookBundleSnapshot,
} from "@zcode/contracts";
import {
  ConfigScope,
  DefaultRuntimeConfig,
  createWorkspaceHookBundleSnapshot,
} from "@zcode/contracts";
import { remoteWorkspaceTrustIdentity } from "@zcode/shared";
import {
  buildWorkspaceHookBundleSnapshot,
  readWorkspaceHookScriptStates,
  resolveWorkspaceHookRuntimeRoot,
  type WorkspaceHookScriptState,
  type WorkspaceHookRuntimeRoot,
} from "@zcode/shared/workspace-hook-discovery";
import {
  resolveWorkspaceHookTrustIdentity,
  type WorkspaceHookTrustIdentityFs,
} from "@zcode/shared/managed-worktree";
import { createConfigPort } from "./index.js";
import { loadFileConfig, getDefaultConfigPath, type LoadedConfig } from "./file-config.adapter.js";
import { parseEnvConfig } from "./env-config.adapter.js";
import { mergeConfigs, createPrioritizedConfig } from "./config-merger.js";
import { createNodeLoggerFactory } from "../logging/index.js";
import {
  loadProjectConfigFile,
  loadProjectConfigs,
  summarizeProjectConfigs,
  type ProjectConfigDiscovery,
  type ProjectConfigFile,
} from "./project-config.adapter.js";

export interface ConfigFactoryOptions {
  /** Path to user config file (default: ~/.kayingcode/cli/config.json) */
  userConfigPath?: string;
  /** Path to project config file */
  projectConfigPath?: string;
  /** Working directory used to discover project config files */
  workingDirectory?: string;
  /** Opaque workspace identity supplied by the existing Host resolver; local callers fall back to workspacePath. */
  workspaceIdentity?: string;
  /**
   * Hook Trust identity（D23），由调用方经 resolveWorkspaceHookTrustIdentityForWorkspace 预先算好。
   * createConfig 是同步函数，而 resolver 需要异步读取 .git 链接，所以不在这里解析。
   * 缺省时沿用旧规则（远程 identity 优先，否则工作目录）。
   */
  workspaceHookTrustIdentity?: string;
  /** Environment variables (default: process.env) */
  env?: Record<string, string | undefined>;
  /** CLI overrides (highest priority) */
  cliOverrides?: RuntimeConfigPatch;
  /** Skip loading user config file */
  skipUserConfig?: boolean;
  /** Optional logger factory for tests or embedding runtimes. Defaults to the node JSONL logger. */
  loggerFactory?: LoggerFactory;
}

export interface ConfigResult {
  configPort: ConfigPort;
  config: RuntimeConfig;
  sources: {
    user: {
      diagnostics: LoadedConfig["diagnostics"];
      path: string;
      loaded: boolean;
      hasMcpServers: boolean;
      hasUiLocale: boolean;
      hasUiTheme: boolean;
      mcpServerNames: string[];
    };
    project: {
      diagnostics: LoadedConfig["diagnostics"];
      path: string | undefined;
      paths: string[];
      loaded: boolean;
      hasUiLocale: boolean;
      hasUiTheme: boolean;
      hasMcpServers: boolean;
      mcpServerNames: string[];
      uiLocalePath: string | undefined;
      uiThemePath: string | undefined;
      workspaceHookSnapshot?: WorkspaceHookBundleSnapshot;
      /**
       * 审核请求与「审核中 toggle」曾各自推导 runtimeRoot（前者遍历
       * default/user/project/env/cli 全部层，后者只读单层 runtimeConfig.hooks），
       * 两者只要有一处不同就产生不同 bundleDigest，toggle 会被误判为
       * workspace_hooks_snapshot_mismatch。这里导出快照实际使用的 runtimeRoot，
       * 让下游复用同一个值，把一致性变成结构性约束而不是巧合。
       */
      workspaceHookRuntimeRoot?: WorkspaceHookRuntimeRoot;
    };
    plugins: PluginConfigSources;
    mcp: {
      serverSources: Record<string, McpServerConfigSource>;
    };
    env: boolean;
    cli: boolean;
  };
}

type OptionalPathLoadedConfig = Omit<LoadedConfig, "path"> & {
  path: string | undefined;
};

export type McpServerConfigSource = "system" | "project" | "user" | "env" | "cli";
export type PluginConfigScope = "user" | "workspace";

export interface PluginConfigSources {
  dirs: {
    user: string[];
    workspace: string[];
  };
  enabled: Record<string, PluginConfigScope>;
  marketplaces: Record<string, PluginConfigScope>;
  options: Record<string, Record<string, PluginConfigScope>>;
  /** 插件选项原始层，敏感选项按层叠加私有文件时使用。 */
  optionLayers: PluginOptionLayer[];
  paths: {
    user: string;
    workspace: string | undefined;
  };
}

export interface PluginOptionLayer {
  scope: PluginConfigScope;
  path: string;
  workspaceRoot?: string;
  options: Record<string, Record<string, string | number | boolean>>;
}

interface LoadedConfigSources {
  userConfigResult: LoadedConfig;
  discoveredProjectConfigs: ProjectConfigDiscovery;
}

function loadConfigSources(options: ConfigFactoryOptions): LoadedConfigSources {
  const userConfigResult: LoadedConfig = options.skipUserConfig
    ? { config: {}, diagnostics: [], path: getDefaultConfigPath(), loaded: false }
    : loadFileConfig(options.userConfigPath);
  const discoveredProjectConfigs: ProjectConfigDiscovery = options.workingDirectory
    ? loadProjectConfigs(options.workingDirectory, options.projectConfigPath)
    : options.projectConfigPath
      ? summarizeProjectConfigs([
          loadProjectConfigFile(options.projectConfigPath, {
            discoveryOrder: 0,
            explicitProjectConfig: true,
          }),
        ])
      : summarizeProjectConfigs([]);
  return { userConfigResult, discoveredProjectConfigs };
}

/**
 * 会话/查询装配的异步入口。
 *
 * 名称沿用上游，但本产品当前没有需要异步写回的插件配置迁移：visualize 官方插件在
 * config/official-plugins.json 中 defaultEnabled=false，从未默认开启，也就不存在
 * “升级后把旧默认值改回关闭”的迁移语义；直接照搬会让用户明确开启的插件被意外关闭。
 * 保留这个入口是因为 Hook Trust 绑定入口脚本内容（D24）必须读文件：这里在异步 IO 中
 * 读取 scriptStates 后交给同步装配，保证 Runtime、Settings 与 CLI trust 得到同一 digest。
 */
export async function createConfigWithPluginMigrations(
  options: ConfigFactoryOptions = {},
): Promise<ConfigResult> {
  const sources = loadConfigSources(options);
  const workspaceHookScriptStates = await readWorkspaceHookScriptStates({
    workspacePath: resolve(options.workingDirectory ?? process.cwd()),
    sources: sources.discoveredProjectConfigs.hookCandidates,
  });
  return assembleConfig(options, sources, workspaceHookScriptStates);
}

/**
 * Create ConfigPort with all sources merged
 *
 * Priority (lowest to highest):
 * 1. System defaults
 * 2. User config file (~/.kayingcode/cli/config.json)
 * 3. Project config files (root to cwd, then explicit projectConfigPath)
 * 4. Environment variables (KAYINGCODE_*)
 * 5. CLI overrides
 */
export function createConfig(options: ConfigFactoryOptions = {}): ConfigResult {
  return assembleConfig(options, loadConfigSources(options));
}

function assembleConfig(
  options: ConfigFactoryOptions,
  sources: LoadedConfigSources,
  workspaceHookScriptStates?: ReadonlyMap<string, WorkspaceHookScriptState>,
): ConfigResult {
  const { userConfigResult, discoveredProjectConfigs } = sources;
  // 1. System defaults
  const configs: ReturnType<typeof createPrioritizedConfig>[] = [
    createPrioritizedConfig(DefaultRuntimeConfig, ConfigScope.System),
  ];

  // 2. User config file
  if (userConfigResult.loaded) {
    configs.push(
      createPrioritizedConfig(
        withHookConfigSource(userConfigResult.config, {
          kind: "user",
          path: userConfigResult.path,
        }),
        ConfigScope.User,
      ),
    );
  }

  // 3. Project config files
  // explicit 配置曾在 auto-discovery 之后手工追加并自行编号，绕过 shared
  // canonical-path dedup；同一文件会进入 snapshot 两次并使既有 Trust 全部 stale。
  // 修法：有 workspace 时由 loadProjectConfigs 统一走 discoverWorkspaceHookConfigPaths，
  // 去重、失败候选占位和 discoveryOrder 均与 Settings builder 同源。
  const projectConfigFiles = discoveredProjectConfigs.files;
  const projectSummary = discoveredProjectConfigs;
  const projectDiagnostics = discoveredProjectConfigs.diagnostics;
  // 配置 diagnostics 过去只返回给调用方，用户导出日志时看不到加载失败或被跳过的 MCP server。
  // 在汇总入口统一写 warn，保留具体文件路径和 JSON path，方便定位迁移配置问题。
  logConfigDiagnostics({
    env: options.env,
    loggerFactory: options.loggerFactory,
    projectDiagnostics,
    userDiagnostics: userConfigResult.diagnostics,
  });
  const projectConfigResult: OptionalPathLoadedConfig =
    summarizeOptionalProjectConfig(projectConfigFiles);
  const projectUiLocalePath = [...projectConfigFiles]
    .reverse()
    .find((file) => file.config.ui?.locale !== undefined)?.path;
  const projectUiThemePath = [...projectConfigFiles]
    .reverse()
    .find((file) => file.config.ui?.theme !== undefined)?.path;

  for (const projectConfig of projectConfigFiles) {
    configs.push(createPrioritizedConfig(projectConfig.config, ConfigScope.Project));
  }

  // 4. Environment variables
  const envConfig = parseEnvConfig(options.env ?? process.env);
  if (Object.keys(envConfig).length > 0) {
    configs.push(
      createPrioritizedConfig(
        withHookConfigSource(envConfig, { kind: "internal" }),
        ConfigScope.Env,
      ),
    );
  }

  // 5. CLI overrides (applied last = highest priority)
  if (options.cliOverrides) {
    configs.push(
      createPrioritizedConfig(
        withHookConfigSource(options.cliOverrides, { kind: "internal" }),
        ConfigScope.Cli,
      ),
    );
  }

  const workspaceHookRuntimeRoot = resolveWorkspaceHookRuntimeRoot([
    DefaultRuntimeConfig.hooks,
    userConfigResult.config.hooks,
    ...projectSummary.hookCandidates.map((candidate) => candidate.hooks),
    envConfig.hooks,
    options.cliOverrides?.hooks,
  ]);
  const workspacePath = resolve(options.workingDirectory ?? process.cwd());
  const fallbackIdentity = options.workspaceIdentity?.trim();
  const workspaceHookSnapshotData = buildWorkspaceHookBundleSnapshot({
    // 未经解析的 identity 与共享 resolver 同一规则：远程保留 host 命名空间、路径取执行目录，
    // 其他自报 identity 忽略。
    workspaceIdentity:
      options.workspaceHookTrustIdentity?.trim() ||
      (fallbackIdentity && remoteWorkspaceTrustIdentity(fallbackIdentity, workspacePath)) ||
      workspacePath,
    workspacePath,
    sources: projectSummary.hookCandidates,
    runtimeRoot: workspaceHookRuntimeRoot,
    ...(workspaceHookScriptStates ? { scriptStates: workspaceHookScriptStates } : {}),
  });
  const workspaceHookSnapshot = workspaceHookSnapshotData
    ? createWorkspaceHookBundleSnapshot(workspaceHookSnapshotData)
    : undefined;

  // Project Hook events stay outside this executable merge. The snapshot above is the only
  // Phase 1 side-channel and cannot be consumed by configured-runner.
  const merged = mergeConfigs(...configs);
  const pluginConfigSources = resolvePluginConfigSources({
    projectConfig: projectConfigResult.config,
    projectFiles: projectConfigFiles,
    projectPath: projectConfigResult.path,
    skipUserConfig: options.skipUserConfig === true,
    userConfig: userConfigResult.config,
    userPath: userConfigResult.path,
  });
  const mcpServerResolution = resolveEffectiveMcpServers({
    cliOverrides: options.cliOverrides,
    envConfig,
    projectConfig: projectConfigResult.config,
    userConfig: userConfigResult.config,
  });
  merged.mcp = {
    ...merged.mcp,
    servers: mcpServerResolution.servers,
  };

  // Create ConfigPort with merged config
  const configPort = createConfigPort(merged);

  return {
    configPort,
    config: configPort.getAll(),
    sources: {
      user: {
        diagnostics: userConfigResult.diagnostics,
        path: userConfigResult.path,
        loaded: userConfigResult.loaded,
        hasMcpServers: userConfigResult.config.mcp?.servers !== undefined,
        hasUiLocale: userConfigResult.config.ui?.locale !== undefined,
        hasUiTheme: userConfigResult.config.ui?.theme !== undefined,
        mcpServerNames: Object.keys(userConfigResult.config.mcp?.servers ?? {}),
      },
      project: {
        diagnostics: projectDiagnostics,
        path: projectConfigResult.path,
        paths: projectSummary.paths,
        loaded: projectConfigResult.loaded,
        hasUiLocale: projectConfigResult.config.ui?.locale !== undefined,
        hasUiTheme: projectConfigResult.config.ui?.theme !== undefined,
        hasMcpServers: projectConfigResult.config.mcp?.servers !== undefined,
        mcpServerNames: projectSummary.mcpServerNames,
        uiLocalePath: projectUiLocalePath,
        uiThemePath: projectUiThemePath,
        ...(workspaceHookSnapshot ? { workspaceHookSnapshot } : {}),
        workspaceHookRuntimeRoot,
      },
      plugins: pluginConfigSources,
      mcp: {
        serverSources: mcpServerResolution.sources,
      },
      env: Object.keys(envConfig).length > 0,
      cli: !!options.cliOverrides,
    },
  };
}

function resolvePluginConfigSources(input: {
  projectConfig: RuntimeConfigPatch;
  projectFiles: readonly ProjectConfigFile[];
  projectPath: string | undefined;
  skipUserConfig: boolean;
  userConfig: RuntimeConfigPatch;
  userPath: string;
}): PluginConfigSources {
  const enabled: Record<string, PluginConfigScope> = {};
  const marketplaces: Record<string, PluginConfigScope> = {};
  const options: Record<string, Record<string, PluginConfigScope>> = {};

  for (const pluginId of Object.keys(input.userConfig.plugins?.enabledPlugins ?? {})) {
    enabled[pluginId] = "user";
  }
  for (const pluginId of Object.keys(input.projectConfig.plugins?.enabledPlugins ?? {})) {
    enabled[pluginId] = "workspace";
  }

  for (const marketplaceId of Object.keys(input.userConfig.plugins?.extraKnownMarketplaces ?? {})) {
    marketplaces[marketplaceId] = "user";
  }
  for (const [pluginId, pluginOptions] of Object.entries(input.userConfig.plugins?.options ?? {})) {
    options[pluginId] = {};
    for (const key of Object.keys(pluginOptions)) options[pluginId][key] = "user";
  }
  for (const [pluginId, pluginOptions] of Object.entries(
    input.projectConfig.plugins?.options ?? {},
  )) {
    const sourceByKey = (options[pluginId] ??= {});
    for (const key of Object.keys(pluginOptions)) sourceByKey[key] = "workspace";
  }

  return {
    dirs: {
      user: input.userConfig.plugins?.dirs ?? [],
      // 项目目录只是待信任候选；config.plugins.dirs 不含它们，发现时按信任记录准入。
      workspace: [...new Set(input.projectFiles.flatMap((file) => file.pluginDirCandidates ?? []))],
    },
    enabled,
    marketplaces,
    options,
    optionLayers: [
      ...(input.skipUserConfig
        ? []
        : [
            {
              scope: "user" as const,
              path: input.userPath,
              options: input.userConfig.plugins?.options ?? {},
            },
          ]),
      ...input.projectFiles.map((file) => ({
        scope: "workspace" as const,
        path: file.path,
        workspaceRoot: file.baseDir,
        options: file.config.plugins?.options ?? {},
      })),
    ],
    paths: {
      user: input.userPath,
      workspace: input.projectPath,
    },
  };
}

function withHookConfigSource(
  config: RuntimeConfigPatch,
  source: HookConfigSource,
): RuntimeConfigPatch {
  if (!config.hooks?.events) return config;
  return {
    ...config,
    hooks: {
      ...config.hooks,
      events: Object.fromEntries(
        Object.entries(config.hooks.events).map(([eventName, matchers]) => [
          eventName,
          matchers?.map((matcher) => ({
            ...matcher,
            hooks: matcher.hooks.map((hook) => ({ ...hook, source: hook.source ?? source })),
          })),
        ]),
      ) as NonNullable<RuntimeConfigPatch["hooks"]>["events"],
    },
  };
}

export function resolveWorkspaceStorageDir(input: {
  env?: Record<string, string | undefined>;
  workingDirectory: string;
}): string {
  const baseStorageDir = createConfig({ env: input.env }).config.storage.dir;
  const projectConfig = loadProjectConfigs(input.workingDirectory);
  let projectStorageDir: string | undefined;
  for (const file of projectConfig.files) {
    projectStorageDir = file.config.storage?.dir ?? projectStorageDir;
  }
  const envStorageDir = parseEnvConfig(input.env ?? process.env).storage?.dir;
  return envStorageDir ?? projectStorageDir ?? baseStorageDir;
}

function resolveEffectiveMcpServers(input: {
  cliOverrides?: RuntimeConfigPatch;
  envConfig: RuntimeConfigPatch;
  projectConfig: RuntimeConfigPatch;
  userConfig: RuntimeConfigPatch;
}): {
  servers: Record<string, McpServerConfig>;
  sources: Record<string, McpServerConfigSource>;
} {
  const servers: Record<string, McpServerConfig> = {};
  const sources: Record<string, McpServerConfigSource> = {};
  const apply = (source: McpServerConfigSource, patch: RuntimeConfigPatch | undefined) => {
    for (const [name, server] of Object.entries(patch?.mcp?.servers ?? {})) {
      servers[name] = server;
      sources[name] = source;
    }
  };

  apply("system", DefaultRuntimeConfig);
  // MCP server discovery has an extension-specific rule: user config shadows project config.
  // This does not change the global config precedence for model/permission/UI fields.
  apply("project", input.projectConfig);
  apply("user", input.userConfig);
  apply("env", input.envConfig);
  apply("cli", input.cliOverrides);
  return { servers, sources };
}

function logConfigDiagnostics(input: {
  env?: Record<string, string | undefined>;
  loggerFactory?: LoggerFactory;
  projectDiagnostics: LoadedConfig["diagnostics"];
  userDiagnostics: LoadedConfig["diagnostics"];
}): void {
  const diagnostics = [
    ...input.userDiagnostics.map((diagnostic) => ({ ...diagnostic, configScope: "user" })),
    ...input.projectDiagnostics.map((diagnostic) => ({ ...diagnostic, configScope: "project" })),
  ];
  if (diagnostics.length === 0) return;

  const loggerFactory = input.loggerFactory ?? createNodeLoggerFactory({ env: input.env });
  const logger = loggerFactory.createLogger("kayingcode").child({
    module: "adapters.config",
  });

  for (const diagnostic of diagnostics) {
    logger.warn(resolveConfigDiagnosticLogMessage(diagnostic.code), {
      configPath: diagnostic.filePath,
      configScope: diagnostic.configScope,
      diagnosticCode: diagnostic.code,
      diagnosticMessage: diagnostic.message,
      diagnosticPath: diagnostic.path,
      event: resolveConfigDiagnosticLogEvent(diagnostic.code),
      severity: diagnostic.severity,
    });
  }
}

function resolveConfigDiagnosticLogMessage(
  code: LoadedConfig["diagnostics"][number]["code"],
): string {
  if (code === "config_mcp_server_invalid") return "MCP server config skipped";
  if (code === "config_project_hooks_pending_trust") {
    return "Project hooks pending workspace trust";
  }
  return "Config file failed to load";
}

function resolveConfigDiagnosticLogEvent(
  code: LoadedConfig["diagnostics"][number]["code"],
): string {
  if (code === "config_mcp_server_invalid") return "config.mcp_server.skipped";
  if (code === "config_project_hooks_pending_trust") {
    return "config.project_hooks.pending_trust";
  }
  return "config.file.invalid";
}

function summarizeOptionalProjectConfig(files: ProjectConfigFile[]): OptionalPathLoadedConfig {
  if (files.length === 0) {
    return { config: {}, diagnostics: [], path: undefined, loaded: false };
  }

  const path = files[files.length - 1]?.path;
  const config = mergeConfigs(
    ...files.map((file) => createPrioritizedConfig(file.config, ConfigScope.Project)),
  );

  return {
    config,
    diagnostics: files.flatMap((file) => file.diagnostics),
    path,
    loaded: true,
  };
}

// ── Hook Trust identity（docs/specs/workspace-hook-trust.md D23）──
// 唯一 resolver 在 @zcode/shared/managed-worktree；这里只提供 Node 只读文件端口与数据根目录。

const KAYINGCODE_DATA_BASE_DIR_ENV_KEY = "KAYINGCODE_DATA_BASE_DIR";

/** 与 Host getDataBaseDir 同规则：KAYINGCODE_DATA_BASE_DIR 优先，空值回落 homedir。 */
export function resolveKayingCodeDataBaseDir(
  env: Record<string, string | undefined> = process.env,
): string {
  return env[KAYINGCODE_DATA_BASE_DIR_ENV_KEY]?.trim() || homedir();
}

const nodeTrustIdentityFs: WorkspaceHookTrustIdentityFs = {
  readFile: (path) => readFile(path, "utf8"),
  realpath: (path) => realpath(path),
  stat: async (path) => {
    try {
      const info = await stat(path);
      return { isFile: info.isFile(), isDirectory: info.isDirectory() };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  },
};

/**
 * 计算 workspace 的 Hook Trust identity。远程 identity 保留 host 命名空间、路径取执行目录；
 * 本地受管 worktree 严格校验通过后归一为源仓库对应路径；其余情况返回 workspacePath
 * （调用方负责传入已规范化的路径）。CLI snapshot、CLI trust 与 Host Settings 必须调用同一实现，
 * 保证两侧 digest / record 键一致（D23）。
 */
export async function resolveWorkspaceHookTrustIdentityForWorkspace(input: {
  workspacePath: string;
  workspaceIdentity?: string;
  env?: Record<string, string | undefined>;
}): Promise<string> {
  return resolveWorkspaceHookTrustIdentity(
    {
      workspacePath: input.workspacePath,
      ...(input.workspaceIdentity ? { workspaceIdentity: input.workspaceIdentity } : {}),
      dataBaseDir: resolveKayingCodeDataBaseDir(input.env),
    },
    nodeTrustIdentityFs,
  );
}
