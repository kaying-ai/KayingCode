// composer-edit-mode 契约与状态：edit scope 唯一性、会话 key、renderer 内存状态与编辑入口 kind 校验。
import { beforeEach, describe, expect, it } from "vitest";
import { HIGHSPEED_PROVIDER_IDS } from "@zcode/shared";
import {
  composerEditQueueKindMismatch,
  composerEditSessionKey,
  createComposerEditScopeId,
  getComposerEditSession,
  isComposerEditScopeId,
  submittedEditConfig,
  useComposerEditStore,
} from "../src/composer-edit-mode/index.js";

function session(scopeId: string) {
  return {
    target: { kind: "queueItem" as const, queueItemId: "q1" },
    scopeId,
    inputKind: "sendText" as const,
    loadedText: "hello",
    lockConfirmed: false,
    draft: { text: "hello", mode: "build" as const },
    attachments: [],
  };
}

describe("composer edit scope contract", () => {
  it("edit scope 带 marker，普通 session scope 不带", () => {
    const scopeId = createComposerEditScopeId("session-1");
    expect(isComposerEditScopeId(scopeId)).toBe(true);
    expect(isComposerEditScopeId("session-1")).toBe(false);
    expect(scopeId.startsWith("session-1::composer-edit:")).toBe(true);
  });

  it("每次进入编辑态生成不同 scope（切换目标不复用旧草稿）", () => {
    expect(createComposerEditScopeId("s")).not.toBe(createComposerEditScopeId("s"));
  });

  it("会话 key 以 workspaceKey 隔离路径相同但身份不同的工作区", () => {
    expect(composerEditSessionKey("local:/repo", "s1")).not.toBe(
      composerEditSessionKey("remote:host:/repo", "s1"),
    );
    expect(composerEditSessionKey("w", "s1")).toBe(composerEditSessionKey("w", "s1"));
  });
});

describe("composer edit store", () => {
  beforeEach(() => {
    useComposerEditStore.setState({ sessions: {} });
  });

  it("begin 递增 focusRequest，update 只改已有编辑态，end 删除", () => {
    const key = composerEditSessionKey("w", "s1");
    const store = useComposerEditStore.getState();
    store.begin(key, session("scope-1"));
    expect(getComposerEditSession(key)?.focusRequest).toBe(1);
    store.requestFocus(key);
    expect(getComposerEditSession(key)?.focusRequest).toBe(2);
    store.update(key, { lockConfirmed: true });
    expect(getComposerEditSession(key)?.lockConfirmed).toBe(true);
    store.update("missing", { lockConfirmed: true });
    expect(getComposerEditSession("missing")).toBeUndefined();
    store.end(key);
    expect(getComposerEditSession(key)).toBeUndefined();
  });
});

describe("submittedEditConfig", () => {
  it("载入提交时配置，缺省字段保留当前草稿", () => {
    expect(
      submittedEditConfig(
        { mode: "yolo", planEnabled: true },
        { mode: "build", planEnabled: false, modelSelection: { providerId: "p", modelId: "m" } },
      ),
    ).toEqual({
      mode: "yolo",
      planEnabled: true,
      modelSelection: { providerId: "p", modelId: "m" },
    });
  });

  it("单轮 Highspeed 模型不载入编辑工具栏，回退当前草稿模型", () => {
    const fallback = { modelSelection: { providerId: "base", modelId: "base-model" } };
    expect(
      submittedEditConfig(
        { modelSelection: { providerId: HIGHSPEED_PROVIDER_IDS.zai, modelId: "fast" } },
        fallback,
      ).modelSelection,
    ).toEqual(fallback.modelSelection);
  });
});

describe("composerEditQueueKindMismatch", () => {
  it("goal 项必须保留 /goal", () => {
    expect(composerEditQueueKindMismatch("sendGoalCommand", "普通文本")).toBe("goal");
    expect(composerEditQueueKindMismatch("sendGoalCommand", "/goal 继续")).toBeNull();
  });

  it("普通项不能改成 /goal", () => {
    expect(composerEditQueueKindMismatch("sendText", "/goal 继续")).toBe("text");
    expect(composerEditQueueKindMismatch("sendText", "普通文本")).toBeNull();
  });
});
