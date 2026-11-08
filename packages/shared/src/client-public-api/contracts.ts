import { z } from "zod";
import { parsePluginStoreOrder, type PluginStoreOrder } from "../pluginStoreOrder.js";
import { helpConfigSchema, type HelpAppConfig } from "../helpAppConfig.js";
import {
  DEFAULT_DYNAMIC_WORKFLOW_MODE,
  normalizeDynamicWorkflowMode,
  type DynamicWorkflowMode,
} from "../dynamic-workflow-feature.js";
import {
  rendererActionTraceConfigSchema,
  DISABLED_RENDERER_ACTION_TRACE_CONFIG,
  type RendererActionTraceConfigV1,
} from "../rendererActionTrace.js";
import type { ForceUpdateConfig } from "../force-update-config.js";

/** GET /api/v1/client/scenes 的场景项（与服务端契约一致）。 */
export interface ClientSceneItem {
  id: string;
  type: string;
  /** 选项标题 i18n。 */
  contents: Record<string, string>;
  /** 选项描述 i18n。 */
  descs?: Record<string, string>;
  /** 选项标签 i18n。 */
  labels: Record<string, string>;
  /** 对话完成后的触发事件。 */
  on_finish?: string | null;
  /** Lucide canonical 图标名（kebab-case）。 */
  img?: string | null;
  /** 兼容保留字段；当前首页与 Automations 图标不消费。 */
  imgs?: {
    cn?: string;
    en?: string;
  };
  share_urls?: Record<string, string>;
  defaults?: Record<string, string[]>;
}

export interface ClientSceneOption {
  id: string;
  type: string;
  /** 选项标题 i18n。 */
  contents: Record<string, string>;
  /** 提示词 i18n。 */
  prompts?: Record<string, string>;
  /** 无筛选时展示的选项。 */
  items?: ClientSceneItem[];
  /** 受哪个 option.type 筛选。 */
  refer?: string;
  /** 其他 option 的 itemId 到筛选后选项的映射。 */
  cascades?: Record<string, ClientSceneItem[]>;
  /** prompt 模板 i18n。 */
  templates?: Record<string, string>;
}

export interface ClientSceneConfig {
  namespace: string;
  scene: string;
  options: Record<string, ClientSceneOption>;
  created_at?: number;
  updated_at?: number;
}

export interface ClientScenesResponseBody<T> {
  code: number;
  msg: string;
  data: T;
}

export type ClientScenesResponse = ClientScenesResponseBody<ClientSceneConfig[]>;

/** 单功能灰度：enabled + 可选版本号。 */
export interface ClientFeatureFlagConfig {
  enabled: boolean;
  configVersion?: string;
}

/**
 * `/api/v1/client/configs` 中已识别的公开配置快照。
 * 各字段独立裁决：缺 key / 非法值 / 无端点时各自回退，互不影响。
 */
export interface ClientConfigsSnapshot {
  pluginStoreOrder: PluginStoreOrder | null;
  help: HelpAppConfig | null;
  /** Built-in Provider 远端清单 URL；null 表示仅用本地 bundled。 */
  builtinProviderConfigJson: string | null;
  dynamicWorkflowMode: DynamicWorkflowMode;
  desktopContextPrompt: ClientFeatureFlagConfig;
  rendererActionTrace: RendererActionTraceConfigV1;
  forceUpdate: ForceUpdateConfig | null;
}

const featureFlagSchema = z.object({
  enabled: z.boolean(),
  config_version: z.string().trim().min(1).max(128).optional(),
});

const builtinProviderConfigJsonSchema = z
  .string()
  .url()
  .refine((value) => {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  });

const dynamicWorkflowSchema = z.object({
  mode: z.string().optional(),
});

const forceUpdateSchema = z.object({
  minimalVersion: z.string().trim().min(1),
});

const clientConfigsEnvelopeSchema = z.object({
  code: z.literal(0),
  data: z
    .object({
      configs: z
        .object({
          pluginStoreOrder: z.unknown().optional(),
          feedbackUrl: helpConfigSchema.optional(),
          builtin_provider_config_json: builtinProviderConfigJsonSchema.optional(),
          dynamicWorkflow: dynamicWorkflowSchema.optional(),
          desktopContextPrompt: featureFlagSchema.optional(),
          rendererActionTrace: rendererActionTraceConfigSchema.optional(),
          forceUpdate: forceUpdateSchema.optional(),
        })
        .nullish(),
    })
    .nullish(),
});

function parseFeatureFlag(value: unknown): ClientFeatureFlagConfig {
  const parsed = featureFlagSchema.safeParse(value);
  if (!parsed.success) return { enabled: false };
  return {
    enabled: parsed.data.enabled,
    ...(parsed.data.config_version ? { configVersion: parsed.data.config_version } : {}),
  };
}

function parseForceUpdate(value: unknown): ForceUpdateConfig | null {
  const parsed = forceUpdateSchema.safeParse(value);
  return parsed.success ? { minimalVersion: parsed.data.minimalVersion } : null;
}

function parseBuiltinProviderConfigJson(value: unknown): string | null {
  return builtinProviderConfigJsonSchema.safeParse(value).data ?? null;
}

function parseDynamicWorkflowMode(value: unknown): DynamicWorkflowMode {
  const mode =
    typeof value === "object" && value !== null
      ? normalizeDynamicWorkflowMode((value as { mode?: unknown }).mode)
      : undefined;
  return mode ?? DEFAULT_DYNAMIC_WORKFLOW_MODE;
}

/**
 * 解析 `/api/v1/client/configs` 响应体为公开快照。
 * 只接受 code=0 的成功 envelope；未下发或非法的单 key 独立回退为安全缺省。
 */
export function parseClientConfigsSnapshot(payload: unknown): ClientConfigsSnapshot {
  const envelope = clientConfigsEnvelopeSchema.safeParse(payload);
  if (!envelope.success) {
    throw new Error("Invalid public client configs response");
  }
  const configs = envelope.data.data?.configs;
  return {
    pluginStoreOrder: parsePluginStoreOrder(configs?.pluginStoreOrder),
    help: configs?.feedbackUrl ?? null,
    builtinProviderConfigJson: parseBuiltinProviderConfigJson(
      configs?.builtin_provider_config_json,
    ),
    dynamicWorkflowMode: parseDynamicWorkflowMode(configs?.dynamicWorkflow),
    desktopContextPrompt: parseFeatureFlag(configs?.desktopContextPrompt),
    rendererActionTrace:
      rendererActionTraceConfigSchema.safeParse(configs?.rendererActionTrace).data ??
      DISABLED_RENDERER_ACTION_TRACE_CONFIG,
    forceUpdate: parseForceUpdate(configs?.forceUpdate),
  };
}

/** 无官方端点 / 响应缺失时的公开配置快照（localrun 缺省）。 */
export function localClientConfigsDefaults(): ClientConfigsSnapshot {
  return {
    pluginStoreOrder: null,
    help: null,
    builtinProviderConfigJson: null,
    dynamicWorkflowMode: DEFAULT_DYNAMIC_WORKFLOW_MODE,
    desktopContextPrompt: { enabled: false },
    rendererActionTrace: DISABLED_RENDERER_ACTION_TRACE_CONFIG,
    forceUpdate: null,
  };
}

/** 无官方端点时的场景列表（localrun 缺省）。 */
export function localClientScenesDefaults(): ClientScenesResponse {
  return { code: 0, msg: "", data: [] };
}

export type { PluginStoreOrder, HelpAppConfig, ForceUpdateConfig };
