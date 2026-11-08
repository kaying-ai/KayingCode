import type { GameDevelopmentPluginListing, PluginSkillDetails } from "@zcode/shared";
import type { CustomCommandRoot } from "../commands/index.js";
import type { HookEventName, HookMatcherConfig } from "../hooks/index.js";
import type { McpServerConfig } from "../interfaces/mcp.port.js";
import type { SkillRoot } from "../skills/index.js";
import type { ExecutionContext, TraceContext } from "../tracing/tracer.js";
import { z } from "zod";

export const KAYINGCODE_OFFICIAL_PLUGIN_MARKETPLACE = "kayingcode-plugins-official";
export const KAYINGCODE_INLINE_PLUGIN_MARKETPLACE = "inline";
export const KAYINGCODE_PLUGIN_HOST_COMMAND = "__kayingcode-plugin-host";
export const CLAUDE_OFFICIAL_PLUGIN_MARKETPLACE = "claude-plugins-official";
export const ZCODE_OFFICIAL_PLUGIN_MARKETPLACE = KAYINGCODE_OFFICIAL_PLUGIN_MARKETPLACE;
export const ZCODE_INLINE_PLUGIN_MARKETPLACE = KAYINGCODE_INLINE_PLUGIN_MARKETPLACE;
export const ZCODE_PLUGIN_HOST_COMMAND = KAYINGCODE_PLUGIN_HOST_COMMAND;
/**
 * 隐藏子命令：dynamic workflow 的沙箱子进程入口（`__kayingcode-dwf-child <entry path>`；argv 末位是
 * harness 写好的入口文件路径，payload 不过命令行）。
 *
 * 与 {@link KAYINGCODE_PLUGIN_HOST_COMMAND} 同族、同机制：SEA 单文件二进制不解释 Node CLI 旗标，
 * 于是 harness 默认的 `node --max-old-space-size=… <entry>` spawn 在 SEA 下会把旗标交给严格
 * parseArgs 而必然失败。SEA 下改为自 re-exec 本二进制并由 `run.ts` 在 parseArgs **之前**分派。
 * 常量放在 contracts 而非 dynamic-workflow-runtime：后者刻意不依赖 contracts（app-free 证明），
 * 由 bootstrap 在 SEA 判定后把它作为 argsPrefix 递给 harness。
 */
export const KAYINGCODE_DWF_CHILD_COMMAND = "__kayingcode-dwf-child";

export function isOfficialMarketplaceId(id: string): boolean {
  return id === KAYINGCODE_OFFICIAL_PLUGIN_MARKETPLACE || id === CLAUDE_OFFICIAL_PLUGIN_MARKETPLACE;
}

export type PluginSource = "official" | "inline" | "cache";
export type PluginDiagnosticSeverity = "warning" | "error";

export type PluginDiagnosticCode =
  | "plugin_root_not_found"
  | "plugin_manifest_not_found"
  | "plugin_manifest_invalid"
  | "plugin_component_path_invalid"
  | "plugin_unsupported_component"
  | "plugin_skill_root_empty"
  | "plugin_mcp_read_failed"
  | "plugin_mcp_invalid"
  | "plugin_mcp_server_disabled"
  | "plugin_hook_read_failed"
  | "plugin_hook_invalid"
  | "plugin_hook_unsupported_event"
  | "plugin_dependency_invalid"
  | "plugin_dependency_missing"
  | "plugin_dependency_cycle"
  | "plugin_dependency_cross_marketplace"
  | "plugin_marketplace_invalid"
  | "plugin_marketplace_declaration_reserved"
  | "plugin_git_unavailable"
  | "plugin_archive_fetch_failed"
  | "plugin_marketplace_source_unsupported"
  | "plugin_validation_deferred"
  | "plugin_variable_missing"
  | "plugin_duplicate_id"
  | "plugin_not_found"
  | "plugin_ambiguous_name"
  | "plugin_ui_contribution_invalid"
  | "plugin_ui_contribution_ambiguous"
  /** bundled（filesystem/sea）cache 缺失，组件清单从源目录只读兜底枚举。 */
  | "plugin_bundled_cache_missing";

export interface PluginUserConfigOption {
  default?: string | number | boolean;
  description?: string;
  title?: string;
  required?: boolean;
  sensitive?: boolean;
  type?: "string" | "number" | "boolean" | "directory" | "file";
}

export type PluginOptionValue = string | number | boolean;
export type PluginOptionValues = Record<string, PluginOptionValue>;

export type PluginMarketplaceSourceConfig =
  | { source: "url"; headers?: Record<string, string>; url: string }
  | { path?: string; ref?: string; repo: string; source: "github"; sparsePaths?: string[] }
  | { path?: string; ref?: string; source: "git"; sparsePaths?: string[]; url: string }
  | { package: string; source: "npm" }
  | { source: "file"; path: string }
  | { source: "directory"; path: string };

export interface PluginMarketplaceConfig {
  source: PluginMarketplaceSourceConfig;
}

export interface PluginHookDetail {
  args?: string[];
  async?: boolean;
  command: string;
  event: HookEventName;
  matcher?: string;
  runnable: boolean;
  shell?: true | string;
  sourcePath: string;
  statusMessage?: string;
  timeout?: number;
  timeoutMs?: number;
  type: "command" | "process";
}

/** 详情 UI 的组件分组类型，顺序与展示一致：agent / command / skill / hook / mcp。 */
export type PluginComponentKind = "agent" | "command" | "skill" | "hook" | "mcp";

export interface PluginComponentItem {
  name: string;
  /** 发现的 agent 源文件路径；仅供 CLI 加载，不投影到组件详情协议。 */
  path?: string;
  /** 来自组件 frontmatter / manifest 的描述；缺失时省略，绝不伪造。 */
  description?: string;
}

export interface PluginComponentGroup {
  kind: PluginComponentKind;
  items: PluginComponentItem[];
}

/**
 * 商店信息（Store Listing）：市场目录条目携带的展示性元数据，描述"如何在商店里呈现"，
 * 不影响插件功能。字段全部可选，缺失时 UI 按降级矩阵处理（字母头像 / 隐藏区块 / 省略信息行）。
 */
export interface PluginStoreListing {
  gameDevelopment?: GameDevelopmentPluginListing;
  skillDetails?: PluginSkillDetails;
  /** 卡片/详情显示名，缺失回退插件 name slug。 */
  displayName?: string;
  displayNameI18n?: Record<string, string>;
  /** 目录条目描述的多语言版本（description 本体已有独立字段）。 */
  descriptionI18n?: Record<string, string>;
  /** icon 图片：https URL 或内置插件的本地资源路径。 */
  icon?: string;
  category?: string;
  /** 官方市场内的维护归属；不参与执行权限和安装来源判定。 */
  publisherType?: "official" | "community";
  author?: string;
  authorUrl?: string;
  homepage?: string;
  privacyPolicy?: string;
  termsOfService?: string;
  /** 详情页 hero 横幅图。 */
  heroImage?: string;
  /** 详情页示例提示词胶囊；点击后新建会话预填。 */
  examplePrompts?: string[];
  examplePromptsI18n?: Record<string, string[]>;
  /**
   * 需要付费套餐才好用：目录条目声明 `requiresPaidPlan: true`，商店卡片与详情页
   * 标题右侧展示提示图标。表达「使用条件」，不代表插件本身是收费商品，
   * 因此不参与安装门禁与计费；命名不绑定具体套餐商品名，套餐改名不会让字段过期。
   */
  requiresPaidPlan?: boolean;
}

export const pluginBrowserCompareProfileSchema = z.enum(["standard-web", "taptap-preview"]);
export type PluginBrowserCompareProfile = z.infer<typeof pluginBrowserCompareProfileSchema>;

const pluginBrowserCompareSourceViewSchema = z
  .object({
    id: z.literal("source"),
    label: z.string().trim().min(1).max(80),
    profile: pluginBrowserCompareProfileSchema,
  })
  .strict();
const pluginBrowserCompareTargetViewSchema = z
  .object({
    id: z.literal("target"),
    label: z.string().trim().min(1).max(80),
    profile: pluginBrowserCompareProfileSchema,
  })
  .strict();

export const pluginBrowserCompareSidePaneContributionSchema = z
  .object({
    contractVersion: z.literal(1),
    id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
    kind: z.literal("browser-compare"),
    title: z.string().trim().min(1).max(80),
    publicationFile: z
      .string()
      .trim()
      .min(1)
      .max(240)
      .refine(
        isSafePluginPublicationPath,
        "publicationFile must be a safe workspace-relative path",
      ),
    views: z.tuple([pluginBrowserCompareSourceViewSchema, pluginBrowserCompareTargetViewSchema]),
  })
  .strict();
export type PluginBrowserCompareSidePaneContribution = z.infer<
  typeof pluginBrowserCompareSidePaneContributionSchema
>;

export interface PluginUiContributions {
  sidePanes: PluginBrowserCompareSidePaneContribution[];
}

export interface PluginUiContributionParseResult {
  contributions?: PluginUiContributions;
  errors: string[];
}

/**
 * 插件 UI 扩展只允许宿主定义的声明式能力。这里 fail closed，绝不把原始 manifest
 * 对象透传到 Renderer，也不允许插件提供 preload、partition 或任意前端代码。
 */
export function parsePluginUiContributions(value: unknown): PluginUiContributionParseResult {
  if (value === undefined) return { errors: [] };
  const root = z
    .object({ sidePanes: z.array(z.unknown()).max(16) })
    .strict()
    .safeParse(value);
  if (!root.success) {
    return { errors: [formatUiContributionIssue("uiContributions", root.error.issues)] };
  }

  const sidePanes: PluginBrowserCompareSidePaneContribution[] = [];
  const errors: string[] = [];
  const seenIds = new Set<string>();
  for (const [index, candidate] of root.data.sidePanes.entries()) {
    const parsed = pluginBrowserCompareSidePaneContributionSchema.safeParse(candidate);
    if (!parsed.success) {
      errors.push(
        formatUiContributionIssue(`uiContributions.sidePanes[${index}]`, parsed.error.issues),
      );
      continue;
    }
    if (seenIds.has(parsed.data.id)) {
      errors.push(
        `uiContributions.sidePanes[${index}]: duplicate contribution id '${parsed.data.id}'`,
      );
      continue;
    }
    seenIds.add(parsed.data.id);
    sidePanes.push(parsed.data);
  }
  return {
    ...(sidePanes.length > 0 ? { contributions: { sidePanes } } : {}),
    errors,
  };
}

function isSafePluginPublicationPath(value: string): boolean {
  if (value.startsWith("/") || value.startsWith("\\") || /^[A-Za-z]:[\\/]/.test(value)) {
    return false;
  }
  const segments = value.split(/[\\/]/);
  return segments.every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}

function formatUiContributionIssue(prefix: string, issues: z.ZodIssue[]): string {
  const issue = issues[0];
  if (!issue) return `${prefix}: invalid UI contribution`;
  const suffix = issue.path.length > 0 ? `.${issue.path.join(".")}` : "";
  return `${prefix}${suffix}: ${issue.message}`;
}

export interface PluginManifest {
  agents?: unknown;
  author?: unknown;
  channels?: unknown;
  commands?: unknown;
  dependencies?: unknown;
  description?: string;
  homepage?: string;
  hooks?: unknown;
  keywords?: unknown;
  license?: string;
  lspServers?: unknown;
  mcpServers?: unknown;
  name: string;
  outputStyles?: unknown;
  repository?: string;
  settings?: unknown;
  skills?: unknown;
  uiContributions?: unknown;
  /** 插件 UI：`ui.surfaces[]` 面板入口声明，adapters 解析。 */
  ui?: unknown;
  userConfig?: Record<string, PluginUserConfigOption>;
  version?: string;
}

/** 面板生命周期：第一版只接受会话级；`draft` 留待需要时放开。 */
export type PluginUiSurfaceAvailability = "session";
/** 标题：单一字符串或按 locale 键的映射（`{ "zh-CN": "...", "en-US": "..." }`）。 */
export type PluginUiSurfaceTitle = string | Record<string, string>;
export interface PluginUiSurfaceDefinition {
  id: string;
  title: PluginUiSurfaceTitle;
  icon?: string;
  /** 运行时 namespaced MCP server 名（`plugin:${name}:${server}`），UI 直接用它调 mcp/uiReadResource。 */
  server: string;
  /** 清单里声明的原始 server 键，仅供诊断与展示。 */
  declaredServer: string;
  /** 必须以 `ui://` 开头。 */
  resourceUri: string;
  availability: PluginUiSurfaceAvailability;
}

export interface PluginConfig {
  dirs: string[];
  enabled: boolean;
  enabledPlugins: Record<string, boolean>;
  extraKnownMarketplaces: Record<string, PluginMarketplaceConfig>;
  options: Record<string, PluginOptionValues>;
  suppressedBuiltins: string[];
}

export interface PluginMetadata {
  /** manifest（plugin.json）里的作者名，规范化为字符串；商店信息缺失时作为详情页回退。 */
  author?: string;
  authorUrl?: string;
  commandRootCount: number;
  /**
   * 权威的组件清单（名称 + 可选描述），由 loader 在解析阶段对插件根目录枚举得出，
   * 与启用态无关。详情 UI 直接展示，无需再在 UI 侧 join Skills/Commands/Agents。
   */
  components: PluginComponentGroup[];
  configuredOptions?: PluginOptionValues;
  dataPath: string;
  declaredMcpServerNames: string[];
  description?: string;
  enabled: boolean;
  /** manifest（plugin.json）homepage；商店信息缺失时作为详情页回退。 */
  homepage?: string;
  id: string;
  manifestPath: string;
  marketplace: string;
  mcpServerNames: string[];
  name: string;
  hookDetails: PluginHookDetail[];
  rootPath: string;
  skillCount: number;
  skillRootCount: number;
  source: PluginSource;
  uiContributions?: PluginUiContributions;
  userConfig?: Record<string, PluginUserConfigOption>;
  version?: string;
}

export interface PluginDiagnostic {
  code: PluginDiagnosticCode;
  message: string;
  path?: string;
  pluginId?: string;
  severity: PluginDiagnosticSeverity;
}

// ============================================================
// Plugin 对话引用（@ Plugin capability hint）的身份 catalog 契约。
// 语义：catalog 在 Session（App）创建时冻结，
// 只承载身份与能力"声明"；实际注入能力每轮与 live inventory 取交集。
// ============================================================

export interface PluginReferenceCatalogEntry {
  /** 稳定 Plugin ID：`${manifest.name}@${marketplace}`，canonical plugin:// 链接的唯一身份。 */
  pluginId: string;
  /** manifest name（Skill/MCP/Subagent runtime 名字空间的基），仅用于展示与 provenance 匹配，不具权威性。 */
  name: string;
  marketplace: string;
  /** catalog 冻结时刻的启用态；disabled 条目保留用于 `disabled_in_session` 诊断，不可被引用。 */
  enabled: boolean;
  /**
   * 与本条目共享 manifest.name 的其他 enabled Plugin stable IDs。
   * 非空即 V1 fail closed 冲突：Picker 禁选、runtime 按 ambiguous 跳过，
   * 禁止 last-write-wins 或 display name 猜测。
   */
  conflictingPluginIds: string[];
  /** 身份声明的 Skill qualified names（`${name}:${skill}`）；来自组件枚举，与 live 发现解耦。 */
  skillQualifiedNames: string[];
  /** 身份声明的 namespaced MCP server names（`plugin:${name}:${server}`）。 */
  mcpServerNames: string[];
  /** 身份声明的 canonical Subagent names（`${name}:${agent}`）；来自组件枚举。 */
  subagentNames: string[];
  /**
   * Plugin 根目录，仅供 runtime 对 live Skill/Subagent 做 provenance 回溯（rootPath 前缀判定）。
   * 禁止进入 provider reminder 或协议投影——路径不属于 identifiers-only 契约。
   */
  rootPath: string;
  /** 面板入口声明（A5）；供 host 在 session 冻结 catalog 里查面板定义。 */
  uiSurfaces?: PluginUiSurfaceDefinition[];
}

export interface PluginReferenceCatalog {
  plugins: PluginReferenceCatalogEntry[];
}

export interface PluginLoadOutcome {
  commandRoots: CustomCommandRoot[];
  diagnostics: PluginDiagnostic[];
  hooks: Partial<Record<HookEventName, HookMatcherConfig[]>>;
  mcpServers: Record<string, McpServerConfig>;
  /** 商店 listing 按完整 Plugin ID 关联，供 CLI/TUI 展示；不参与运行时身份判断。 */
  pluginListingsById?: Record<string, PluginStoreListing>;
  plugins: PluginMetadata[];
  skillRoots: SkillRoot[];
}

export interface PluginDiscoverRequest {
  config: PluginConfig;
  env?: Record<string, string | undefined>;
  // bootstrap 可以把"安全到默认就开"的 official plugin id 列表传进来,
  // 让用户不必先 `kayingcode plugins enable` 就能用 (例如纯内容型的 skill-creator)。
  // 默认空集合, 现有 plugin (含 ios-simulator/android-emulator 这种重负载) 行为不变。
  officialPluginsEnabledByDefault?: ReadonlySet<string>;
  officialPluginRoots?: string[];
  storageRoot: string;
  trace?: TraceContext;
  workingDirectory: string;
}

export interface PluginOperationOptions {
  context?: ExecutionContext;
  signal?: AbortSignal;
}

export interface PluginPort {
  discoverPlugins(
    request: PluginDiscoverRequest,
    options?: PluginOperationOptions,
  ): Promise<PluginLoadOutcome>;
}

export * from "./official-plugin-release.js";
export * from "./official-plugin-catalog.generated.js";
