// ZCode 会话编排的纯逻辑单测（连接状态映射 / 工作区归一 / 客户端构造）。
// 不需要 Taro：socket 工厂经注入，构造 ZflowClient 不会触达网络。
import { test } from "node:test";
import assert from "node:assert/strict";
import type { MobileAccount, ZflowRelayState } from "@kayingcode/mobile-client-core";
import {
  createZflowClient,
  isConnectableZcodeAccount,
  mapRelayStateToConnectionStatus,
  normalizeZcodeWorkspace,
  normalizeZcodeWorkspaces,
} from "./zcode";

const ZCODE_ACCOUNT: MobileAccount = {
  id: "acc-1",
  label: "ZCode 桌面",
  url: "https://z.ai/remote/v4?sid=cue-1",
  backendType: "zcode",
  addedAt: 0,
  lastUsedAt: null,
};

const KAYINGCODE_ACCOUNT: MobileAccount = {
  id: "acc-2",
  label: "KayingCode",
  url: "https://relay.example.com#pair-1#secret-1",
  backendType: "kayingcode",
  addedAt: 0,
  lastUsedAt: null,
};

test("relay 状态全量映射到壳层连接状态", () => {
  const cases: Array<[ZflowRelayState, string]> = [
    ["idle", "idle"],
    ["connecting", "connecting"],
    ["authenticating", "connecting"],
    ["waiting", "pairing"],
    ["paired", "paired"],
    ["reconnecting", "connecting"],
    ["error", "error"],
    ["kicked", "error"],
    ["closed", "error"],
  ];
  for (const [relay, expected] of cases) {
    assert.equal(mapRelayStateToConnectionStatus(relay), expected, `state=${relay}`);
  }
});

test("workspaceIdentity 优先作为 workspaceKey，path 兜底", () => {
  assert.deepEqual(
    normalizeZcodeWorkspace({
      path: "/Users/me/proj",
      workspaceIdentity: "  ident-1  ",
      label: "项目",
    }),
    {
      workspaceKey: "ident-1",
      label: "项目",
      path: "/Users/me/proj",
      workspaceIdentity: "ident-1",
    },
  );
  assert.deepEqual(normalizeZcodeWorkspace({ path: "/Users/me/proj" }), {
    workspaceKey: "/Users/me/proj",
    label: "proj",
    path: "/Users/me/proj",
  });
});

test("workspacePath / workspaceKey 别名与 label 兜底", () => {
  assert.deepEqual(normalizeZcodeWorkspace({ workspacePath: "/a/b/c", label: "" }), {
    workspaceKey: "/a/b/c",
    label: "c",
    path: "/a/b/c",
  });
  assert.deepEqual(normalizeZcodeWorkspace({ workspaceKey: "only-key" }), {
    workspaceKey: "only-key",
    label: "only-key",
    path: "only-key",
  });
  // 反斜杠路径按 Windows 语义取末段。
  assert.equal(normalizeZcodeWorkspace({ path: "C:\\work\\app" })?.label, "app");
});

test("缺少任何可用键的条目归一为 null", () => {
  assert.equal(normalizeZcodeWorkspace({ label: "只有标签" }), null);
  assert.equal(normalizeZcodeWorkspace({}), null);
  assert.equal(normalizeZcodeWorkspace(null), null);
  assert.equal(normalizeZcodeWorkspace("字符串"), null);
  assert.equal(normalizeZcodeWorkspace(["数组"]), null);
});

test("normalizeZcodeWorkspaces 接受 bootstrap 包裹与裸数组", () => {
  const entries = [{ path: "/p/one" }, { path: "/p/two", label: "二" }];
  assert.deepEqual(
    normalizeZcodeWorkspaces({ workspaces: entries }).map((w) => w.label),
    ["one", "二"],
  );
  assert.deepEqual(
    normalizeZcodeWorkspaces(entries).map((w) => w.workspaceKey),
    ["/p/one", "/p/two"],
  );
});

test("normalizeZcodeWorkspaces 对非法载荷返回空数组", () => {
  assert.deepEqual(normalizeZcodeWorkspaces(null), []);
  assert.deepEqual(normalizeZcodeWorkspaces(undefined), []);
  assert.deepEqual(normalizeZcodeWorkspaces("nope"), []);
  assert.deepEqual(normalizeZcodeWorkspaces({ workspaces: "nope" }), []);
  assert.deepEqual(normalizeZcodeWorkspaces([{ label: "无键" }, 42]), []);
});

test("可连接判定只认 ZCode URL", () => {
  assert.equal(isConnectableZcodeAccount(ZCODE_ACCOUNT), true);
  assert.equal(isConnectableZcodeAccount(KAYINGCODE_ACCOUNT), false);
  assert.equal(isConnectableZcodeAccount({ ...ZCODE_ACCOUNT, url: "坏连接串" }), false);
});

test("createZflowClient 构造 ZCode 客户端，非 ZCode 档案抛错", () => {
  const client = createZflowClient(ZCODE_ACCOUNT, { platformName: "h5" });
  assert.equal(client.relay.params.deviceSid, "cue-1");
  assert.equal(client.relay.params.relayWsUrl, "wss://z.ai/api/v1/remote/ws2");
  assert.equal(client.bridges.length, 0);
  client.dispose();

  assert.throws(
    () => createZflowClient(KAYINGCODE_ACCOUNT, { platformName: "h5" }),
    /不是 ZCode 连接/,
  );
});
