import test from "node:test";
import assert from "node:assert/strict";
import {
  groupRecentProjects,
  parseProjectMessage,
  projectKey,
  webviewEntryUrl,
} from "./projectNavigation";
test("项目元数据严格解析，身份优先且设备隔离，不接收凭据", () => {
  const value = parseProjectMessage({
    type: "kayingcode.project-opened.v1",
    workspacePath: "/game",
    workspaceIdentity: " remote-a ",
    token: "never-save",
  });
  assert.deepEqual(value, { workspacePath: "/game", workspaceIdentity: "remote-a" });
  assert.equal(parseProjectMessage({ type: "other", workspacePath: "/game" }), null);
  assert.equal(
    parseProjectMessage({ type: "kayingcode.project-opened.v1", workspacePath: "" }),
    null,
  );
  assert.equal(
    parseProjectMessage({
      type: "kayingcode.project-opened.v1",
      workspacePath: "/game",
      workspaceIdentity: 123,
    }),
    null,
  );
  assert.notEqual(
    projectKey({ accountId: "a", ...value! }),
    projectKey({ accountId: "b", ...value! }),
  );
  assert.notEqual(
    projectKey({ accountId: "a", ...value! }),
    projectKey({ accountId: "a", ...value!, workspaceIdentity: "remote-b" }),
  );
});

test("小程序链接不依赖 URL，保留授权 fragment 并按需覆盖设备/项目参数", () => {
  const raw = "https://example.test/remote/v4?sid=desktop#authorize=original%2Bproof";
  assert.equal(
    webviewEntryUrl(raw, { kayingShell: "1", sid: undefined }),
    "https://example.test/remote/v4?sid=desktop&kayingShell=1#authorize=original%2Bproof",
  );
  assert.equal(
    webviewEntryUrl(raw, { sid: "other", kayingWorkspace: "remote:/game" }),
    "https://example.test/remote/v4?sid=other&kayingWorkspace=remote%3A%2Fgame#authorize=original%2Bproof",
  );
});

test("相同项目路径按实际网页设备 SID 隔离", () => {
  const p = { accountId: "account", workspacePath: "/game" };
  assert.notEqual(
    projectKey({ ...p, deviceSid: "desktop-a" }),
    projectKey({ ...p, deviceSid: "desktop-b" }),
  );
});

test("列表按连接及最近使用排序，折叠同设备的 Windows 分隔符别名", () => {
  const common = { accountId: "a", deviceSid: "device", lastUsedAt: 1 };
  const original = { ...common, workspacePath: "D:/code/game" };
  const latest = { ...common, workspacePath: "D:\\code\\game", lastUsedAt: 8 };
  const otherAccount = { ...original, accountId: "b", lastUsedAt: 5 };
  const otherDevice = { ...original, deviceSid: "other", lastUsedAt: 4 };
  const explicit = { ...original, workspaceIdentity: original.workspacePath, lastUsedAt: 3 };
  const posix = { ...common, workspacePath: "/code/game" };
  const posixWithBackslash = { ...common, workspacePath: "/code\\game" };
  assert.deepEqual(
    [
      ...groupRecentProjects([
        original,
        otherAccount,
        otherDevice,
        explicit,
        posix,
        posixWithBackslash,
        latest,
      ]),
    ],
    [
      ["a", [latest, otherDevice, explicit, posix, posixWithBackslash]],
      ["b", [otherAccount]],
    ],
  );
  assert.notEqual(projectKey(original), projectKey(latest));
});
