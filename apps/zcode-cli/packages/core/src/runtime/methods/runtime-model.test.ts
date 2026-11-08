import assert from "node:assert/strict";
import test from "node:test";
import {
  createRootTraceContext,
  createSessionId,
  getCurrentModelInvocationContext,
  type Model,
  type ModelRequestAdmission,
} from "@zcode/contracts";
import type { AgentRuntimeInternal } from "../internal.js";
import { createRuntimeModel } from "./runtime-model.js";
import { testModelConnectivity } from "./workspace-generate-text.js";

const SELECTION = { providerId: "probe-provider", modelId: "probe-model" } as const;

/** 记录每次物理请求在 invocation context 中看到的准入端口。 */
function createProbeModel(seen: boolean[]): Model {
  const model: Model = {
    providerId: SELECTION.providerId,
    modelId: SELECTION.modelId,
    properties: {} as Model["properties"],
    optionSpecs: {
      reasoningLevel: { values: ["low"], map: "{}" },
      maxOutputTokens: { max: 8, map: "{}" },
    },
    options: {},
    bind: () => model,
    generateText: async () => {
      throw new Error("generateText must not be used by the connectivity probe");
    },
    async *streamText() {
      seen.push(getCurrentModelInvocationContext()?.modelRequestAdmission !== undefined);
      yield { type: "finish", finishReason: "stop", usage: {} };
    },
  };
  return model;
}

function createRuntime(seen: boolean[], admission: ModelRequestAdmission): AgentRuntimeInternal {
  const model = createProbeModel(seen);
  return {
    config: {},
    modelRequestAdmission: admission,
    modelFactory: () => model,
    rootTraceContext: createRootTraceContext({ sessionId: createSessionId() }),
    createModelStatusSink: () => ({ publish: async () => {} }),
  } as unknown as AgentRuntimeInternal;
}

test("连通性探测不携带请求准入，审核 Bot 无 review binding 时仍可测试模型", async () => {
  const seen: boolean[] = [];
  // 审核额度准入在没有 review session binding 时会失败关闭；探测不应该触发它。
  const admission: ModelRequestAdmission = {
    acquire: async () => {
      throw new Error("admission must not be requested by the connectivity probe");
    },
  };
  await testModelConnectivity.call(createRuntime(seen, admission), { selection: SELECTION });
  assert.deepEqual(seen, [false]);
});

test("普通 runtime 模型调用仍携带 runtime 层请求准入", async () => {
  const seen: boolean[] = [];
  const admission: ModelRequestAdmission = {
    acquire: async () => {
      throw new Error("admission must not be requested by this fake model");
    },
  };
  const model = createRuntimeModel(createRuntime(seen, admission), { selection: SELECTION });
  for await (const event of model.streamText({ messages: [{ role: "user", content: "hi" }] })) {
    assert.equal(event.type, "finish");
  }
  assert.deepEqual(seen, [true]);
});
