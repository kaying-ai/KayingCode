import assert from "node:assert/strict";
import test from "node:test";
import type { MobileAccount } from "@kayingcode/mobile-client-core";
import {
  createZcodeWebOpener,
  getZcodeWebUrl,
  readZcodeWebAccountId,
  readZcodeWebProjectParams,
  zcodeWebPageUrl,
} from "./zcodeWeb";

const account: MobileAccount = {
  id: "local-device",
  label: "Test PC",
  backendType: "kayingcode",
  url: "https://example.test/remote/v4?sid=test-device&name=Test%20PC&app_version=3.17.2#authorize=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  addedAt: 0,
  lastUsedAt: null,
};

test("网页保留当前 V2 链接，旧鉴权链接被拒绝", () => {
  assert.equal(getZcodeWebUrl(account), account.url);
  assert.equal(
    getZcodeWebUrl({
      ...account,
      url: account.url.replace("#authorize=", "&hash=old&t=1#authorize="),
    }),
    null,
  );
  const web = { ...account, backendType: "kayingcode" as const, url: account.url };
  assert.equal(getZcodeWebUrl(web), web.url);
  assert.equal(getZcodeWebUrl({ ...account, url: `  ${account.url}  ` }), account.url);
});

test("网页拒绝无效、非 HTTPS、已删除及其他后端档案", () => {
  for (const invalid of [
    null,
    { ...account, url: account.url.replace("https:", "http:") },
    { ...account, url: account.url.replace("https:", "wss:") },
    { ...account, url: "https://example.test/no-device" },
    { ...account, url: "javascript:alert(1)" },
  ])
    assert.equal(getZcodeWebUrl(invalid), null);
});

test("容器路由只传本地 id，不携带官方连接信息", () => {
  const id = "local/id #1";
  const route = zcodeWebPageUrl(id);
  assert.equal(route, "/pages/zcode-web/index?accountId=local%2Fid%20%231");
  assert.equal(readZcodeWebAccountId({ accountId: encodeURIComponent(id) }), id);
  assert.equal(readZcodeWebAccountId({}), null);
  assert.equal(readZcodeWebAccountId({ accountId: "%invalid" }), null);
  assert.doesNotMatch(route, /sid=|hash=|https|token/);
});

test("容器路由的项目键和设备 SID 只解码一次", () => {
  const workspace = "remote-agent:host:repo:%2Fgame%25";
  const sid = "device/a";
  assert.deepEqual(
    readZcodeWebProjectParams({
      workspace: encodeURIComponent(workspace),
      deviceSid: encodeURIComponent(sid),
    }),
    { kayingWorkspace: workspace, sid },
  );
  assert.deepEqual(readZcodeWebProjectParams({ workspace: "%bad%" }), {
    kayingWorkspace: "%bad%",
    sid: undefined,
  });
});

test("多入口同时点击只导航一次，成功后 touch，返回后可再次打开", async () => {
  const calls: string[] = [];
  let finish!: () => void;
  const open = createZcodeWebOpener({
    findAccount: () => account,
    navigate: async (url) => {
      calls.push(url);
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
    },
    touch: (id) => {
      calls.push(`touch:${id}`);
    },
  });
  const first = open(account);
  await open(account);
  assert.deepEqual(calls, [zcodeWebPageUrl(account.id)]);
  finish();
  await first;
  assert.equal(calls[1], `touch:${account.id}`);
  const again = open(account);
  finish();
  await again;
  assert.equal(calls.length, 4);
});

test("导航失败不 touch 且可重试；档案删除或变更后旧入口不导航", async () => {
  let saved: MobileAccount | null = account;
  let failed = true;
  let navigations = 0;
  let touches = 0;
  const open = createZcodeWebOpener({
    findAccount: () => saved,
    navigate: async () => {
      navigations++;
      if (failed) throw new Error("navigation failed");
    },
    touch: () => {
      touches++;
    },
  });
  await assert.rejects(open(account), /navigation failed/);
  assert.equal(touches, 0);
  failed = false;
  await open(account);
  assert.equal(touches, 1);
  saved = null;
  await assert.rejects(open(account), /连接信息已失效/);
  saved = { ...account, url: `${account.url}-changed` };
  await assert.rejects(open(account), /连接信息已失效/);
  assert.equal(navigations, 2);
});
