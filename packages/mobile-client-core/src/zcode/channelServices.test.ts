import assert from "node:assert/strict";
import { test } from "vitest";
import { BridgeSession } from "./bridgeSession.js";
import { ChannelAttachments } from "./channelAttachments.js";
import { ChannelAutomation } from "./channelAutomation.js";
import { ChannelModelProviders } from "./channelModelProviders.js";
import { ChannelWorkspacePrep } from "./channelWorkspacePrep.js";
import { ChannelRpcError, Channels } from "./channelClient.js";

function bridgeWithHost(response: (channel: string, method: string, args: unknown[]) => unknown) {
  const bridge = new BridgeSession({ workspaceKey: "identity" });
  const calls: Array<[string, string, unknown[]]> = [];
  Object.defineProperty(bridge, "channels", {
    value: {
      call: async (channel: string, method: string, args: unknown[]) => {
        calls.push([channel, method, args]);
        return response(channel, method, args);
      },
    },
  });
  return { bridge, calls };
}

test("自动化与模型供应商按现有通道名称、参数形状调用", async () => {
  const { bridge, calls } = bridgeWithHost((_channel, method) =>
    method === "listAutomations" || method === "getAll" || method === "list" ? [] : {},
  );
  const automation = new ChannelAutomation(bridge, {
    workspacePath: "/repo",
    workspaceIdentity: "id",
  });
  const models = new ChannelModelProviders(bridge);
  await automation.list();
  await automation.setEnabled("auto-1", false);
  await automation.offPeakQueue();
  await models.getAll();
  await models.delete("provider-1");
  assert.deepEqual(calls, [
    [Channels.zcodeAgent, "listAutomations", [{ workspacePath: "/repo", workspaceIdentity: "id" }]],
    [
      Channels.zcodeAgent,
      "setAutomationEnabled",
      [{ workspacePath: "/repo", workspaceIdentity: "id", automationId: "auto-1", enabled: false }],
    ],
    [Channels.offPeakTask, "list", [{ workspacePath: "/repo", workspaceIdentity: "id" }]],
    [Channels.modelProvider, "getAll", []],
    [Channels.modelProvider, "delete", [{ id: "provider-1" }]],
  ]);
  bridge.dispose();
});

test("附件上传按 begin/chunk/commit 顺序传 checksum 与已提交引用", async () => {
  const { bridge, calls } = bridgeWithHost((_channel, method) => {
    if (method === "helloConversationV4") return { connectionId: "conn-1" };
    if (method === "attachmentBeginV4") return { state: "uploading", nextChunkIndex: 0 };
    if (method === "attachmentChunkV4") return { nextChunkIndex: 1 };
    if (method === "attachmentCommitV4") return { ref: "ref-1" };
    throw new Error(`unexpected ${method}`);
  });
  const progress: number[] = [];
  const result = await new ChannelAttachments(bridge, { workspacePath: "/repo" }).put({
    sessionId: "s1",
    fileName: "a.txt",
    mime: "text/plain",
    bytes: new Uint8Array([97, 98, 99]),
    onProgress: (fraction) => progress.push(fraction),
  });
  assert.deepEqual(result, { ref: "ref-1", fileName: "a.txt", mime: "text/plain", bytes: 3 });
  assert.deepEqual(
    calls.map(([, method]) => method),
    ["helloConversationV4", "attachmentBeginV4", "attachmentChunkV4", "attachmentCommitV4"],
  );
  assert.deepEqual(calls[0]?.[2], []);
  const beginCall = calls[1];
  const chunkCall = calls[2];
  assert.ok(beginCall);
  assert.ok(chunkCall);
  assert.equal(
    (beginCall[2][0] as { checksum: string }).checksum,
    "sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
  assert.equal((chunkCall[2][0] as { dataBase64: string }).dataBase64, "YWJj");
  assert.equal(progress.at(-1), 1);
  bridge.dispose();
});

test("附件分片进度异常触发 abort；读取按游标校验并拼接", async () => {
  let invalidChunk = true;
  const { bridge, calls } = bridgeWithHost((_channel, method) => {
    if (method === "helloConversationV4") return { connectionId: "conn-1" };
    if (method === "attachmentBeginV4") return { state: "uploading", nextChunkIndex: 0 };
    if (method === "attachmentChunkV4") return { nextChunkIndex: invalidChunk ? 99 : 1 };
    if (method === "attachmentAbortV4") return {};
    if (method === "attachmentReadV4")
      return { totalBytes: 3, nextOffset: 3, dataBase64: "YWJj", mediaType: "text/plain" };
    throw new Error(`unexpected ${method}`);
  });
  const service = new ChannelAttachments(bridge, { workspacePath: "/repo" });
  await assert.rejects(
    () =>
      service.put({
        sessionId: "s1",
        fileName: "a.txt",
        mime: "text/plain",
        bytes: new Uint8Array([97]),
      }),
    /进度无效/,
  );
  assert.equal(calls.at(-1)?.[1], "attachmentAbortV4");
  invalidChunk = false;
  const read = await service.read("s1", "ref-1");
  assert.deepEqual(Array.from(read.bytes), [97, 98, 99]);
  assert.equal(read.mediaType, "text/plain");
  bridge.dispose();
});

test("ZCode 工作区目录走 zcode-session 的 presentation，技能走 skills 通道", async () => {
  const { bridge, calls } = bridgeWithHost((_channel, method) => {
    if (method === "readWorkspacePresentation")
      return {
        mode: "build",
        slashCommands: [
          { name: "compact", description: "压缩", inputHint: "[说明]" },
          { description: "缺 name 的条目被丢弃" },
        ],
      };
    if (method === "list") return [{ name: "review", description: "审查", enabled: true }];
    throw new Error(`unexpected ${method}`);
  });
  const service = new ChannelWorkspacePrep(bridge, {
    workspacePath: "/repo",
    workspaceIdentity: "id",
  });
  const config = await service.prepare();
  const skills = await service.skills();
  assert.deepEqual(config.configOptions, [
    { id: "mode", name: "模式", category: "mode", type: "select", currentValue: "build" },
  ]);
  assert.deepEqual(config.slashCommands, [
    { name: "compact", description: "压缩", inputHint: "[说明]" },
  ]);
  assert.deepEqual(skills, [{ name: "review", description: "审查" }]);
  assert.deepEqual(
    calls.map(([channel, method]) => [channel, method]),
    [
      [Channels.zcodeSession, "readWorkspacePresentation"],
      [Channels.skills, "list"],
    ],
  );
  assert.deepEqual(calls[0]?.[2], [{ workspacePath: "/repo", workspaceIdentity: "id" }]);
  bridge.dispose();
});

test("模型供应商删除仅在通道错误时尝试旧参数形状", async () => {
  const { bridge, calls } = bridgeWithHost((_channel, _method, args) => {
    if (typeof args[0] === "object") throw new ChannelRpcError("旧宿主参数", null);
    return { status: "accepted" };
  });
  await new ChannelModelProviders(bridge).delete("provider-1");
  assert.deepEqual(
    calls.map(([, , args]) => args),
    [[{ id: "provider-1" }], ["provider-1"]],
  );
  bridge.dispose();
});
