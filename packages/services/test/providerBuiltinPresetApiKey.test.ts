import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { test } from "vitest";
import {
  ApiKeyAccessConfig,
  ModelConfigRules,
  ProviderConfig,
  type ProviderConfigLayerSnapshot,
  ProviderConfigMap,
  ProviderConfigResolver,
} from "@zcode/provider";
import { NodeKayingCodeBuiltinProviderConfigSource } from "@zcode/provider-node";

const BUILTIN_CONFIG_PATH = fileURLToPath(
  new URL("../../../config/provider/kayingcode-builtin.json", import.meta.url),
);

const PRESET_CASES = [
  {
    providerId: "zai-standard-api",
    providerName: "Z.ai",
    group: "zai-family",
    baseUrl: "https://api.z.ai/api/paas/v4",
    apiKeyManagementUrl: "https://z.ai/manage-apikey/apikey-list",
  },
  {
    providerId: "bigmodel-standard-api",
    providerName: "BigModel",
    group: "bigmodel-family",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    apiKeyManagementUrl: "https://bigmodel.cn/usercenter/proj-mgmt/apikeys",
  },
] as const;

function resolveSnapshot(
  snapshot: ProviderConfigLayerSnapshot,
  personalProviders: ProviderConfigMap,
) {
  return new ProviderConfigResolver().resolve({
    kayingcodeBuiltinProviders: snapshot.providers,
    kayingcodeBuiltinProviderTemplates: snapshot.providerTemplates,
    personalProviders,
    kayingcodeBuiltinModelRules: snapshot.models,
    personalModels: ModelConfigRules.empty(),
    accountProviders: ProviderConfigMap.empty(),
  });
}

test("内置 Z.ai / BigModel 入口是自包含的 API Key Provider", async () => {
  const source = new NodeKayingCodeBuiltinProviderConfigSource({
    bundledFilePath: BUILTIN_CONFIG_PATH,
    watch: false,
  });
  try {
    const snapshot = await source.read();
    for (const preset of PRESET_CASES) {
      const rule = snapshot.providers.getRule(preset.providerId);
      assert.ok(rule, `${preset.providerId} 必须存在`);
      assert.equal(rule.providerName, preset.providerName);
      assert.equal(rule.templateId, undefined);
      assert.equal(rule.config.group, preset.group);
      assert.equal(rule.config.api?.toJSON().type, "openai-chat-completions");
      assert.equal(rule.config.api?.toJSON().baseUrl, preset.baseUrl);
      assert.deepEqual(rule.config.builtinModelIds, ["GLM-5.3", "GLM-5.3-Flash"]);
      const access = rule.config.access?.toJSON();
      assert.equal(access?.type, "api-key");
      assert.equal(access?.apiKeyManagementUrl, preset.apiKeyManagementUrl);
      assert.equal(access?.apiKey, undefined);
    }
  } finally {
    source.dispose();
  }
});

test("保存 Personal API Key 后两个预设 Provider 与模型进入 Registry", async () => {
  const source = new NodeKayingCodeBuiltinProviderConfigSource({
    bundledFilePath: BUILTIN_CONFIG_PATH,
    watch: false,
  });
  try {
    const snapshot = await source.read();

    const before = resolveSnapshot(snapshot, ProviderConfigMap.empty());
    for (const preset of PRESET_CASES) {
      const provider = before.resolvedProviders.find(
        (item) => item.providerId === preset.providerId,
      );
      assert.ok(provider);
      assert.ok(provider.providerIssues.some((issue) => issue.code === "required-field-missing"));
      assert.ok(provider.models.every((model) => !model.executable));
    }

    const personalProviders = new ProviderConfigMap(
      PRESET_CASES.map((preset) => [
        preset.providerId,
        new ProviderConfig({
          access: new ApiKeyAccessConfig({ apiKey: "test-only-key" }),
        }),
      ]),
    );
    const after = resolveSnapshot(snapshot, personalProviders);
    assert.deepEqual(
      after.registryProviders.map((provider) => provider.providerId).sort(),
      PRESET_CASES.map((preset) => preset.providerId).sort(),
    );
    for (const preset of PRESET_CASES) {
      const provider = after.registryProviders.find(
        (item) => item.providerId === preset.providerId,
      );
      assert.ok(provider);
      assert.deepEqual(
        provider.models.map((model) => model.modelId),
        ["GLM-5.3", "GLM-5.3-Flash"],
      );
    }
  } finally {
    source.dispose();
  }
});
