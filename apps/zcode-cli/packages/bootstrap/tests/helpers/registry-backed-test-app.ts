// 恢复自上游 a4b44451:apps/zcode-cli/packages/bootstrap/tests/helpers/registry-backed-test-app.ts。
// 产品适配点：createZCodeApp → createKayingCodeApp、ZCodeApp → KayingCodeApp；Provider 配置使用
// 产品 ProviderConfig 的完整 Schema（无 label/enabled 字段），并把 ModelConfig 的 toJSON 结果交给
// 执行 Model，避免把 Provider 配置类实例透传到 contracts 的数据类型。
import {
  createModel as createExecutableModel,
  type AiSdkModelAdapter,
  type CreateAiSdkModelOptions,
} from "@zcode/adapters/model";
import { afterEach } from "vitest";
import { type ModelEvent, type ModelRequest, type ModelResult } from "@zcode/contracts";
import {
  ApiKeyAccessConfig,
  ModelConfig,
  ModelOptionSpecsConfig,
  ModelPropertiesConfig,
  ProviderApiConfig,
  ProviderConfig,
  ProviderRegistry,
  type Provider,
  type ProviderApiType,
  type RegistryModelConfig,
  type RegistryProviderConfig,
} from "@zcode/provider";
import { createKayingCodeApp } from "../../src/app/create-app.js";
import type { KayingCodeApp, KayingCodeAppOptions } from "../../src/app/types.js";

const DEFAULT_TEST_MODEL = {
  providerId: "zai",
  modelId: "glm-4.6",
} as const;

export interface RegistryBackedTestModelExecution {
  providerId: string;
  modelId: string;
}

export interface RegistryBackedTestModelExecutor {
  generateText(
    request: ModelRequest,
    execution: RegistryBackedTestModelExecution,
  ): Promise<ModelResult>;
  streamText?(
    request: ModelRequest,
    execution: RegistryBackedTestModelExecution,
  ): AsyncIterable<ModelEvent>;
}

type RegistryBackedTestAppOptions = Omit<KayingCodeAppOptions, "providerRegistry"> & {
  modelExecutor?: RegistryBackedTestModelExecutor;
  providerRegistry?: KayingCodeAppOptions["providerRegistry"];
};

const openedApps: Awaited<ReturnType<typeof createKayingCodeApp>>[] = [];

afterEach(async () => {
  // 仅关闭数据库会留下 App 的配置 watcher，后续用例持续累积监听和读取；按 App 所有权回收。
  for (const app of openedApps.splice(0)) await app.close?.();
});

export async function createRegistryBackedTestApp(
  options: RegistryBackedTestAppOptions = {},
): Promise<KayingCodeApp> {
  const modelSelections = collectModelSelections(options);
  const providerRegistry = options.providerRegistry ?? createTestProviderRegistry(modelSelections);
  const { modelExecutor, ...appOptions } = options;

  const app = await createKayingCodeApp({
    ...appOptions,
    runtimeConfig: {
      ...appOptions.runtimeConfig,
      // 测试基座默认关闭标题生成，避免无关 Session 测试产生额外模型调用与事件。
      titleGeneration: appOptions.runtimeConfig?.titleGeneration ?? { enabled: false },
    },
    providerRegistry,
    ...(modelExecutor ? { modelAdapter: createRegistryBackedTestModelAdapter(modelExecutor) } : {}),
  });
  openedApps.push(app);
  return app;
}

export function createTestProviderRegistry(
  modelSelections: readonly { providerId: string; modelId: string }[] = [DEFAULT_TEST_MODEL],
): ProviderRegistry {
  const orderedSelections = dedupeModelSelections([DEFAULT_TEST_MODEL, ...modelSelections]);
  const modelsByProvider = new Map<string, string[]>();
  for (const selection of orderedSelections) {
    const providerId = String(selection.providerId);
    const modelId = String(selection.modelId);
    const models = modelsByProvider.get(providerId) ?? [];
    models.push(modelId);
    modelsByProvider.set(providerId, models);
  }

  const providers: Provider[] = Array.from(modelsByProvider, ([providerId, modelIds]) => ({
    providerId,
    config: createApiKeyProviderConfig({
      apiFormat: "anthropic-messages",
      apiKey: "registry-test-key",
      baseURL: `https://${providerId}.registry.test`,
      models: modelIds,
    }),
    models: modelIds.map((modelId) => ({
      modelId,
      config: createTestModelConfig() as unknown as RegistryModelConfig,
    })),
  }));
  return new ProviderRegistry(providers);
}

/** 上游 provider-config-fixtures.ts 的 API Key 分支；产品的 ProviderConfig 不承载 label/enabled。 */
function createApiKeyProviderConfig(input: {
  apiFormat: ProviderApiType;
  apiKey: string;
  baseURL: string;
  models: readonly string[];
}): RegistryProviderConfig {
  return new ProviderConfig({
    group: "standard-personal",
    access: new ApiKeyAccessConfig({ apiKey: input.apiKey }),
    api: new ProviderApiConfig({ type: input.apiFormat, baseUrl: input.baseURL }),
    builtinModelIds: input.models,
    personalModelIds: [],
    visibility: "visible",
  }) as unknown as RegistryProviderConfig;
}

function createTestModelConfig(): ModelConfig {
  const reasoningLevels = ["low", "medium", "high", "deep"] as const;
  return new ModelConfig({
    enabled: true,

    properties: new ModelPropertiesConfig({
      requiresMfjsToolSchema: false,
      contextWindow: 1_000_000,
      inputFormat: {
        supportsText: true,
        supportsImage: true,
        supportsVideo: true,
        supportsAudio: false,
        supportsPdf: true,
      },
      outputFormat: { supportsText: true },
      supportsToolCall: true,
      supportsJsonSchemaOutput: true,
      supportsNativeWebSearch: false,
      supportsMidConversationSystem: false,
    }),
    optionSpecs: new ModelOptionSpecsConfig({
      reasoningLevel: {
        values: reasoningLevels,
        map: '{"output_config":{"effort":reasoningLevel}}',
      },
      maxOutputTokens: {
        max: 1_000_000,
        map: '{"max_tokens":maxOutputTokens}',
      },
    }),
  });
}

function collectModelSelections(
  options: RegistryBackedTestAppOptions,
): { providerId: string; modelId: string }[] {
  const selections: { providerId: string; modelId: string }[] = [];
  const add = (selection: { providerId: string; modelId: string } | undefined) => {
    if (selection) selections.push(selection);
  };
  if (options.runtimeConfig?.modelSelection) {
    selections.push(options.runtimeConfig.modelSelection);
  }
  add(options.runtimeConfig?.titleGeneration?.modelSelection);
  if (options.configuredDefaultModelSelection) {
    selections.push(options.configuredDefaultModelSelection);
  }
  return selections;
}

function dedupeModelSelections(
  selections: readonly { providerId: string; modelId: string }[],
): { providerId: string; modelId: string }[] {
  const seen = new Set<string>();
  return selections.filter((selection) => {
    const key = `${String(selection.providerId)}/${String(selection.modelId)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function createRegistryBackedTestModelAdapter(
  executor: RegistryBackedTestModelExecutor,
): AiSdkModelAdapter {
  return {
    addStatusSink: () => {},
    createModel: (input: CreateAiSdkModelOptions) => {
      const execution = (): RegistryBackedTestModelExecution => ({
        providerId: input.providerId,
        modelId: input.modelId,
      });
      const properties = input.modelConfig.properties?.toJSON();
      const optionSpecs = input.modelConfig.optionSpecs?.toJSON();
      if (!properties || !optionSpecs) {
        throw new Error("Registry 测试 Model 缺少完整 properties/optionSpecs");
      }
      return createExecutableModel({
        providerId: input.providerId,
        modelId: input.modelId,
        displayName: input.displayName,
        properties,
        optionSpecs,
        options: input.options,
        executor: {
          generateText: (request) => executor.generateText(request, execution()),
          streamText: (request) =>
            executor.streamText?.(request, execution()) ??
            streamResult(executor.generateText(request, execution())),
        },
      });
    },
    setModelIoFullRetentionEnabled: () => {},
  } as unknown as AiSdkModelAdapter;
}

async function* streamResult(result: Promise<ModelResult>): AsyncIterable<ModelEvent> {
  const resolved = await result;
  if (resolved.text) {
    yield { id: "bootstrap-test-text", type: "text_start" };
    yield { id: "bootstrap-test-text", text: resolved.text, type: "text_delta" };
    yield { id: "bootstrap-test-text", type: "text_end" };
  }
  yield {
    finishReason: resolved.finishReason,
    type: "finish",
    usage: resolved.usage,
  };
}
