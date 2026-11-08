import assert from "node:assert/strict";
import { test } from "vitest";
import {
  createClientPublicApi,
  createLocalClientPublicApi,
  createRemoteClientPublicApi,
  localClientConfigsDefaults,
  localClientConfigsEnvelope,
  parseClientConfigsSnapshot,
} from "@zcode/shared";

const call = { appVersion: "0.0.0-test", platform: "test" } as const;

test("parseClientConfigsSnapshot 解析公开配置各 key", () => {
  const snapshot = parseClientConfigsSnapshot({
    code: 0,
    data: {
      configs: {
        pluginStoreOrder: { code: { categoryOrder: ["builtin"] } },
        feedbackUrl: { feedback_url: "https://feedback.example", feedback_use_external_form: true },
        builtin_provider_config_json: "https://cdn.example/builtin.json",
        dynamicWorkflow: { mode: "onDemand" },
        desktopContextPrompt: { enabled: true, config_version: "v2" },
        forceUpdate: { minimalVersion: "1.2.3" },
      },
    },
  });
  assert.deepEqual(snapshot.pluginStoreOrder, { code: { categoryOrder: ["builtin"] } });
  assert.equal(snapshot.help?.feedback_url, "https://feedback.example");
  assert.equal(snapshot.builtinProviderConfigJson, "https://cdn.example/builtin.json");
  assert.equal(snapshot.dynamicWorkflowMode, "onDemand");
  assert.deepEqual(snapshot.desktopContextPrompt, { enabled: true, configVersion: "v2" });
  assert.deepEqual(snapshot.forceUpdate, { minimalVersion: "1.2.3" });
});

test("local ApiMock 无网络返回缺省快照", async () => {
  const api = createLocalClientPublicApi();
  const configs = await api.getClientConfigs(call);
  assert.deepEqual(configs, localClientConfigsDefaults());
  const scenes = await api.getClientScenes(call);
  assert.deepEqual(scenes, { code: 0, msg: "", data: [] });
});

test("旁路 envelope 无 key 时回退 fail-close 缺省", () => {
  const envelope = localClientConfigsEnvelope();
  assert.equal(envelope.code, 0);
  const snapshot = parseClientConfigsSnapshot(envelope);
  assert.deepEqual(snapshot, localClientConfigsDefaults());
});

test("factory 无端点走 ApiMock，有端点走远端", async () => {
  const calls: string[] = [];
  const api = createClientPublicApi({
    resolveEndpointOrigin: () => "",
    request: async (input) => {
      calls.push(String(input));
      return new Response(JSON.stringify({ code: 0, data: { configs: {} } }), { status: 200 });
    },
  });
  const local = await api.getClientConfigs(call);
  assert.equal(local.pluginStoreOrder, null);
  assert.equal(calls.length, 0);

  const remoteApi = createClientPublicApi({
    resolveEndpointOrigin: () => "https://example.test",
    request: async (input) => {
      calls.push(String(input));
      return new Response(
        JSON.stringify({
          code: 0,
          data: { configs: { pluginStoreOrder: { work: { categoryOrder: ["a"] } } } },
        }),
        { status: 200 },
      );
    },
  });
  const remote = await remoteApi.getClientConfigs(call);
  assert.equal(calls.length, 1);
  assert.match(calls[0]!, /^https:\/\/example\.test\/api\/v1\/client\/configs/);
  assert.deepEqual(remote.pluginStoreOrder, { work: { categoryOrder: ["a"] } });
});

test("remote 实现拒绝空 URL 与错误 envelope", async () => {
  const remote = createRemoteClientPublicApi({
    endpointOrigin: "",
    request: async () => {
      throw new Error("should not be called");
    },
  });
  await assert.rejects(() => remote.getClientConfigs(call));

  const bad = createRemoteClientPublicApi({
    endpointOrigin: "https://example.test",
    request: async () =>
      new Response(JSON.stringify({ code: 1, data: { configs: {} } }), { status: 200 }),
  });
  await assert.rejects(() => bad.getClientConfigs(call));
});
