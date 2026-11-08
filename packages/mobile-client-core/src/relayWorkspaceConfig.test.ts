// workspace-config 投影测试：快照整体替换 + config.updated 单 op 替换语义。
// 与 conversation/sessions-index 同一纪律——键级整体替换，绝不深合并；这里只验证
// 消费侧投影语义，wire 装配归 shared 的 assembler 测试面。
import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  WorkspaceConfigState,
  WorkspaceConfigTopicFrame,
} from "@zcode/shared/kayingcode-protocol-v4";

import { RelayWorkspaceConfigProjection } from "./relayWorkspaceConfig.js";

const modelOptions: WorkspaceConfigState = {
  configOptions: [
    {
      id: "model",
      name: "模型",
      type: "select",
      currentValue: "glm/glm-4.6",
      options: [
        { value: "glm/glm-4.6", name: "glm-4.6", modelProviderName: "GLM" },
        { value: "glm/glm-4.5", name: "glm-4.5", modelProviderName: "GLM" },
      ],
    },
    { id: "mode", name: "模式", type: "select", currentValue: "build" },
  ],
  slashCommands: [
    { name: "compact", description: "压缩上下文", source: "builtin" },
    { name: "goal", description: "设定目标", inputHint: "目标文本", source: "builtin" },
  ],
};

function snapshotFrame(config: WorkspaceConfigState, logEpoch = "e1"): WorkspaceConfigTopicFrame {
  return {
    topic: "workspace-config/ws-1",
    subscriptionId: "sub-1",
    fromSeq: 0,
    toSeq: 1,
    sentAt: 0,
    payload: {
      kind: "snapshot",
      snapshot: { protocolVersion: 1, workspaceId: "ws-1", logEpoch, config },
    },
  } as unknown as WorkspaceConfigTopicFrame;
}

function updatedFrame(config: WorkspaceConfigState): WorkspaceConfigTopicFrame {
  return {
    topic: "workspace-config/ws-1",
    subscriptionId: "sub-1",
    fromSeq: 2,
    toSeq: 2,
    sentAt: 0,
    payload: { kind: "deltas", deltas: [{ op: "config.updated", config }] },
  } as unknown as WorkspaceConfigTopicFrame;
}

test("workspace-config 投影：快照整体替换配置项与 slash 目录", () => {
  const projection = new RelayWorkspaceConfigProjection();
  projection.applyFrame(snapshotFrame(modelOptions));

  assert.equal(projection.logEpoch, "e1");
  assert.equal(projection.configOptions.length, 2);
  assert.equal(projection.slashCommands.length, 2);
  assert.equal(projection.option("model")?.currentValue, "glm/glm-4.6");
  assert.equal(projection.option("thought_level"), null);
});

test("workspace-config 投影：config.updated 整体替换，不做字段级合并", () => {
  const projection = new RelayWorkspaceConfigProjection();
  projection.applyFrame(snapshotFrame(modelOptions));
  // 下一版只发布 mode：上一版的 model 项必须消失（并发到达的旧目录不能靠合并存活）。
  projection.applyFrame(
    updatedFrame({
      configOptions: [{ id: "mode", name: "模式", type: "select", currentValue: "plan" }],
      slashCommands: [{ name: "compact", description: "压缩上下文" }],
    }),
  );

  assert.equal(projection.configOptions.length, 1);
  assert.equal(projection.option("model"), null);
  assert.equal(projection.option("mode")?.currentValue, "plan");
  assert.equal(projection.slashCommands.length, 1);
  // logEpoch 只由快照推进：delta 不带代际，不能凭空改写。
  assert.equal(projection.logEpoch, "e1");
});

test("workspace-config 投影：切换工作区后的新快照覆盖旧选项集", () => {
  const projection = new RelayWorkspaceConfigProjection();
  projection.applyFrame(snapshotFrame(modelOptions, "e1"));
  projection.applyFrame(snapshotFrame({ configOptions: [], slashCommands: [] }, "e2"));

  assert.equal(projection.logEpoch, "e2");
  assert.equal(projection.configOptions.length, 0);
  assert.equal(projection.slashCommands.length, 0);
});
