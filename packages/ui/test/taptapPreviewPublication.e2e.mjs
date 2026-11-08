import assert from "node:assert/strict";
import { resolve } from "node:path";
import { chromium } from "playwright-core";
import { createServer } from "vite";

const fixture = resolve(import.meta.dirname, "fixtures/taptap-preview-publication");
const server = await createServer({
  configFile: false,
  root: fixture,
  resolve: {
    alias: [
      ...[
        "hooks/useServices.js",
        "logger.js",
        "i18n/IntlProvider.js",
        "browser-use/UnifiedBrowserView.js",
      ].map((name) => ({
        find: `@/${name}`,
        replacement: resolve(fixture, "mocks.jsx"),
      })),
      { find: "@", replacement: resolve(import.meta.dirname, "../src") },
    ],
  },
  esbuild: { jsx: "automatic" },
  server: { host: "127.0.0.1", port: 0, fs: { allow: [resolve(import.meta.dirname, "../../..")] } },
});
let browser;
try {
  await server.listen();
  browser = await chromium.launch({
    channel: process.platform === "win32" ? "msedge" : "chrome",
    headless: true,
  });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(server.resolvedUrls.local[0]);
  await page.waitForFunction(() => window.previewTest?.watched.length > 0);
  const receipt = {
    schemaVersion: 1,
    operationId: "publish-1",
    workspaceKey: "identity-a",
    sessionId: "task-a",
    projectRoot: "/workspace/games/demo",
    previewUrl: "https://maker.taptap.cn/app/demo?localDev=1",
    publishedAt: "2026-10-18T00:00:00.000Z",
    revision: 1,
  };
  const publish = (value, path) =>
    page.evaluate(({ value, path }) => window.previewTest.write(value, path), { value, path });
  const opened = (count) =>
    page.waitForFunction((count) => window.previewTest.opened.length === count, count);
  const publishAndRead = async (value, path) => {
    const before = await page.evaluate(() => window.previewTest.reads);
    await publish(value, path);
    await page.waitForFunction((before) => window.previewTest.reads > before, before);
    await page.evaluate(() => new Promise(requestAnimationFrame));
  };
  // 首轮 compare receipt 尚未创建；连续转写提交也不能打开独立游戏预览。
  await page.evaluate(() =>
    window.previewTest.render({ workspaceKey: "transcription", workspacePath: "/transcription" }),
  );
  await page.waitForFunction(() =>
    window.previewTest.watched.some((watch) => watch.path === "/transcription"),
  );
  for (const revision of [1, 2, 2]) {
    await publishAndRead(
      { ...receipt, workspaceKey: "transcription", revision, previewMode: "transcription-compare" },
      "/transcription",
    );
    assert.equal(await page.evaluate(() => window.previewTest.state), null);
    assert.equal(await page.evaluate(() => window.previewTest.opened.length), 0);
  }
  await page.getByRole("button", { name: "打开转写对比" }).click();
  const compareState = await page.evaluate(() => window.previewTest.state);
  assert.equal(compareState.tabs[0].type, "plugin-browser-compare");
  await publishAndRead(
    {
      ...receipt,
      workspaceKey: "transcription",
      revision: 3,
      previewMode: "transcription-compare",
    },
    "/transcription",
  );
  assert.deepEqual(
    await page.evaluate(() => window.previewTest.state),
    compareState,
    "转写提交保持比较面板焦点与 source/target guest 身份",
  );
  await page.evaluate(() =>
    window.previewTest.render({
      workspaceKey: "transcription",
      workspacePath: "/transcription",
      task: "task-b",
    }),
  );
  await publishAndRead(
    {
      ...receipt,
      workspaceKey: "transcription",
      revision: 4,
      previewMode: "transcription-compare",
    },
    "/transcription",
  );
  assert.deepEqual(
    await page.evaluate(() => window.previewTest.state),
    compareState,
    "后台转写提交不能创建独立预览或改变面板",
  );
  await publish(
    { ...receipt, workspaceKey: "transcription", revision: 5, previewMode: "standalone" },
    "/transcription",
  );
  await opened(1);
  await page.getByRole("button", { name: "关闭预览" }).click();
  await page.evaluate(() => {
    window.previewTest.opened.length = 0;
  });
  await page.evaluate(() => window.previewTest.render());
  await page.waitForFunction(() => window.previewTest.subscriptions > 0);
  await publish(receipt);
  await opened(1);
  const first = await page.evaluate(() => window.previewTest.state.tabs[0]);
  assert.equal(first.type, "taptap-preview");
  assert.match(first.tabId, /^taptap-preview:task-a:/);
  assert.equal(await page.evaluate(() => window.previewTest.watched[0].recursive), true);
  await publish({ ...receipt, operationId: "publish-2", revision: 2 });
  await opened(2);
  assert.equal(await page.evaluate(() => window.previewTest.state.tabs[0].tabId), first.tabId);
  await page.getByRole("button", { name: "关闭预览" }).click();
  await publishAndRead({ ...receipt, operationId: "publish-2", revision: 2 });
  assert.equal(await page.evaluate(() => window.previewTest.state), null);
  assert.equal(await page.evaluate(() => window.previewTest.opened.length), 2);
  await publish({ ...receipt, operationId: "publish-3", revision: 3 });
  await opened(3);
  assert.notEqual(await page.evaluate(() => window.previewTest.state.tabs[0].tabId), first.tabId);
  await page.evaluate(() => window.previewTest.render({ task: "task-b" }));
  await publish({ ...receipt, operationId: "publish-4", revision: 4, sessionId: "task-b" });
  await opened(4);
  const active = await page.evaluate(() => window.previewTest.state.activeTabId);
  assert.equal(active, "taptap-preview:task-b");
  await publish({ ...receipt, operationId: "publish-5", revision: 5 });
  await opened(5);
  assert.equal(await page.evaluate(() => window.previewTest.state.activeTabId), active);
  for (const invalid of [
    { ...receipt, revision: 6, workspaceKey: "other" },
    { ...receipt, revision: 6, sessionId: undefined },
    { ...receipt, revision: 1 },
    { ...receipt, revision: 6, previewUrl: "https://example.com" },
  ]) {
    await publishAndRead(invalid);
    assert.equal(await page.evaluate(() => window.previewTest.opened.length), 5);
  }
  await page.evaluate(() => {
    window.previewTest.defer = true;
  });
  await publish({ ...receipt, revision: 7 });
  await page.waitForFunction(() => !!window.previewTest.deferred);
  await page.evaluate(() =>
    window.previewTest.render({ workspacePath: "/other", workspaceKey: "identity-b" }),
  );
  await page.waitForFunction(() =>
    window.previewTest.watched.some((watch) => watch.path === "/other"),
  );
  await page.evaluate(() => {
    window.previewTest.deferred();
  });
  await publish({ ...receipt, revision: 8, workspaceKey: "identity-b" }, "/other");
  await opened(6);
  assert.equal(await page.evaluate(() => window.previewTest.opened.at(-1).revision), 8);
  await page.evaluate(() =>
    window.previewTest.render({
      enabled: false,
      workspacePath: "/other",
      workspaceKey: "identity-b",
    }),
  );
  await page.waitForFunction(() => window.previewTest.subscriptions === 0);
  await publish({ ...receipt, revision: 9, workspaceKey: "identity-b" }, "/other");
  assert.deepEqual(
    await page.evaluate(() => window.previewTest.opened.map((item) => item.revision)),
    [1, 2, 3, 4, 5, 8],
  );
  await page.evaluate(() =>
    window.previewTest.render({
      enabled: false,
      showPane: true,
      workspacePath: "/other",
      workspaceKey: "identity-b",
    }),
  );
  const panel = page.getByTestId("preview-panel");
  await panel.getByTestId("preview-guest").waitFor();
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 800 });
    assert.equal(await panel.getByRole("button").count(), 0, "预览无测试/发布草稿按钮或操作栏");
    assert.equal(
      await panel
        .getByTestId("preview-guest")
        .evaluate((guest) => guest.parentElement.dataset.slot),
      "tabs-content",
      "游戏视图直接占用内容区，移除快捷操作栏及占位容器",
    );
    assert.equal(
      await panel.getByTestId("preview-guest").getAttribute("data-url"),
      "https://maker.taptap.cn/app/demo?localDev=1&tab=preview",
    );
  }
  await page.evaluate(() =>
    window.previewTest.render({
      enabled: false,
      showPane: true,
      workspacePath: "/other",
      workspaceKey: "identity-b",
      capture: {
        requestId: "capture-test",
        viewport: { width: 960, height: 540 },
        surfaceScaleMode: "unscaled",
      },
    }),
  );
  await page.waitForFunction(
    () =>
      document.querySelector('[data-testid="preview-guest"]')?.getAttribute("data-capture") ===
      "capture-test",
  );
  assert.equal(
    await panel.locator('[data-browser-screenshot-surface-state="preparing"]').count(),
    1,
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS TapTap preview E2E: transcription first/continued publish, comparison focus and guests, ordinary publication lifecycle, task ownership, capability gating, desktop/mobile widths, screenshot preparation",
  );
} finally {
  await browser?.close();
  await server.close();
}
