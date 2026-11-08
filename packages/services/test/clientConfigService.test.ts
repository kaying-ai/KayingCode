import assert from "node:assert/strict";
import { test } from "vitest";
import { createClientPublicApi, createRemoteClientPublicApi } from "@zcode/shared";
import { createClientConfigService } from "../src/client-config/clientConfigService.js";

test("无官方端点时走 ApiMock，返回空配置快照且不发起请求", async () => {
  let requests = 0;
  const service = createClientConfigService({
    api: createClientPublicApi({
      resolveEndpointOrigin: () => "",
      request: async () => {
        requests += 1;
        return new Response("{}", { status: 200 });
      },
    }),
    resolveRequestContext: async () => ({
      endpointOrigin: "",
      appVersion: "0.0.0-test",
      platform: "test",
    }),
  });

  const snapshot = await service.getSnapshot();
  assert.deepEqual(snapshot, {
    pluginStoreOrder: null,
    zsrcUrl: null,
    uiPluginRecommendations: [],
  });
  assert.equal(requests, 0);
});

test("有效端点时请求公开配置并解析 pluginStoreOrder", async () => {
  const calls: URL[] = [];
  const service = createClientConfigService({
    api: createRemoteClientPublicApi({
      endpointOrigin: "https://example.test",
      request: async (input) => {
        calls.push(new URL(String(input)));
        return new Response(
          JSON.stringify({
            code: 0,
            data: {
              configs: {
                pluginStoreOrder: {
                  code: { categoryOrder: ["builtin", "community"] },
                  work: { pluginOrder: { builtin: ["plugin-b", "plugin-a"] } },
                },
              },
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      },
    }),
    resolveRequestContext: async () => ({
      endpointOrigin: "https://example.test",
      appVersion: "0.0.0-test",
      platform: "test",
    }),
  });

  const snapshot = await service.getSnapshot();

  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.origin, "https://example.test");
  assert.equal(calls[0]!.pathname, "/api/v1/client/configs");
  assert.deepEqual(snapshot.pluginStoreOrder, {
    code: { categoryOrder: ["builtin", "community"] },
    work: { pluginOrder: { builtin: ["plugin-b", "plugin-a"] } },
  });
});
