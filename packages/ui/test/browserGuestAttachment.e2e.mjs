import assert from "node:assert/strict";
import { resolve } from "node:path";
import { chromium } from "playwright-core";
import { createServer } from "vite";

const mocks = resolve(import.meta.dirname, "fixtures/browser-guest-attachment/mocks.jsx");
const mockedModules = [
  "hooks/usePlatform.js",
  "hooks/useWebElementPicker.js",
  "i18n/IntlProvider.js",
  "logger.js",
  "EmbeddedBrowserPaneParts.js",
  "browser-use/BrowserViewportSurface.js",
  "browser-use/BrowserViewportToolbar.js",
  "browser-use/useBrowserResizeOperationWarning.js",
  "browser-use/useBrowserScreenshotSurfaceReady.js",
  "browser-use/useEmbeddedBrowserWheelChain.js",
  "browser-use/useDesktopZoomFactor.js",
  "browser-use/ResponsiveBrowserViewport.js",
];
const server = await createServer({
  configFile: false,
  root: resolve(import.meta.dirname, "fixtures/browser-guest-attachment"),
  resolve: {
    alias: [
      ...mockedModules.map((name) => ({ find: `@/${name}`, replacement: mocks })),
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
  const waitForAttach = (count) =>
    page.waitForFunction((count) => window.attachmentTest?.pending.length === count, count);
  const synchronized = () =>
    page.evaluate(() =>
      window.attachmentTest.calls.filter(
        (call) => call.kind === "viewport" || call.kind === "residency",
      ),
    );
  await waitForAttach(1);
  assert.deepEqual(await synchronized(), [], "首次挂载不能在 attach 确认前同步");
  await page.evaluate(() =>
    window.attachmentTest.render({
      isVisible: false,
      isCurrentTask: false,
      controlledHumanViewportPreference: {
        mode: "responsive",
        viewport: { width: 960, height: 540 },
        zoom: "100",
      },
    }),
  );
  await waitForAttach(2);
  await page.evaluate(() => window.attachmentTest.pending[0]({ ok: true }));
  assert.deepEqual(await synchronized(), [], "旧 attach 完成不能放行最新请求");
  await page.evaluate(() => window.attachmentTest.pending[1]({ ok: true }));
  await page.waitForFunction(() =>
    window.attachmentTest.calls.some((call) => call.kind === "residency"),
  );
  const first = await synchronized();
  assert.deepEqual(first.find((call) => call.kind === "viewport").payload.viewport, {
    width: 960,
    height: 540,
  });
  assert.equal(first.find((call) => call.kind === "residency").payload.visible, false);
  await page.evaluate(() => {
    window.attachmentTest.calls.length = 0;
    window.attachmentTest.render({ sessionId: "other" });
  });
  await waitForAttach(3);
  assert.deepEqual(await synchronized(), [], "scope 切换使旧确认失效");
  await page.evaluate(() =>
    window.attachmentTest.pending[2]({
      ok: false,
      recoveryRequested: false,
      reason: "scope-mismatch",
    }),
  );
  assert.deepEqual(await synchronized(), [], "拒绝 attach 不同步");
  await page.evaluate(() => window.attachmentTest.unmount());
  await page.evaluate(() => window.attachmentTest.remount({ sessionId: "new" }));
  await waitForAttach(4);
  assert.deepEqual(await synchronized(), [], "新 guest 不能沿用旧确认");
  await page.evaluate(() => window.attachmentTest.pending[3]({ ok: true }));
  await page.waitForFunction(() =>
    window.attachmentTest.calls.some(
      (call) => call.kind === "residency" && call.payload.sessionId === "new",
    ),
  );
  // 不同 guest 的延迟 ACK 即使在新节点挂载后到达，也不能提交旧状态。
  await page.evaluate(() => {
    window.attachmentTest.calls.length = 0;
    window.attachmentTest.render({ browserKey: "old-pending" });
  });
  await waitForAttach(5);
  await page.evaluate(() => window.attachmentTest.unmount());
  await page.evaluate(() =>
    window.attachmentTest.remount({
      browserKey: "human",
      controlledHumanViewportPreference: undefined,
      initialHumanViewportPreference: {
        mode: "responsive",
        viewport: { width: 1024, height: 768 },
        zoom: "100",
      },
    }),
  );
  await waitForAttach(6);
  await page.evaluate(() => window.attachmentTest.pending[4]({ ok: true }));
  assert.deepEqual(await synchronized(), [], "卸载后旧 ACK 不得同步");
  await page.evaluate(() => window.attachmentTest.pending[5]({ ok: true }));
  await page.waitForFunction(() =>
    window.attachmentTest.calls.some((call) => call.kind === "viewport"),
  );
  assert.deepEqual(
    (await synchronized()).find((call) => call.kind === "viewport").payload.viewport,
    { width: 1024, height: 768 },
  );
  await page.evaluate(() => {
    window.attachmentTest.calls.length = 0;
    window.attachmentTest.unmount();
  });
  await page.evaluate(() =>
    window.attachmentTest.remount({
      browserKey: "agent",
      initialHumanViewportPreference: undefined,
    }),
  );
  await waitForAttach(7);
  await page.evaluate(() => window.attachmentTest.pending[6]({ ok: true }));
  await page.waitForFunction(() =>
    window.attachmentTest.calls.some((call) => call.kind === "residency"),
  );
  assert.equal(
    (await synchronized()).filter((call) => call.kind === "viewport").length,
    0,
    "Agent attach 不主动覆盖 viewport",
  );
  await page.evaluate(() => {
    window.attachmentTest.calls.length = 0;
    const event = new Event("render-process-gone");
    event.details = { reason: "crashed", exitCode: 1 };
    document.querySelector("webview").dispatchEvent(event);
  });
  await waitForAttach(8);
  const recoveryCalls = await page.evaluate(() => window.attachmentTest.calls);
  assert.equal(recoveryCalls[0].kind, "detach", "恢复仍须先断开旧 guest CDP");
  assert.deepEqual(await synchronized(), [], "替代 guest 等待自己的 attach ACK");
  await page.evaluate(() => window.attachmentTest.pending[7]({ ok: true }));
  await page.waitForFunction(() =>
    window.attachmentTest.calls.some((call) => call.kind === "residency"),
  );
  await page.evaluate(() => {
    window.attachmentTest.calls.length = 0;
    window.attachmentTest.unmount();
  });
  await page.evaluate(() =>
    window.attachmentTest.remount({ browserKey: "manual", showToolbar: true }),
  );
  await waitForAttach(9);
  await page.getByTestId("toggle-viewport").click();
  assert.deepEqual(await synchronized(), [], "等待 attach 时手动调整只更新 UI");
  await page.evaluate(() => window.attachmentTest.pending[8]({ ok: true }));
  await page.waitForFunction(() =>
    window.attachmentTest.calls.some((call) => call.kind === "viewport"),
  );
  assert.deepEqual(
    (await synchronized()).find((call) => call.kind === "viewport").payload.viewport,
    { width: 1280, height: 720 },
  );
  await page.evaluate(() => {
    const guest = document.querySelector("webview");
    window.oldGuest = guest;
    // 模拟 Agent 的 Main 直达导航：尚未提交 did-navigate，不经过地址栏 openUrl。
    const start = Object.assign(new Event("did-start-navigation"), {
      url: "https://studio.example.test/map",
      isMainFrame: true,
    });
    guest.dispatchEvent(start);
    guest.dispatchEvent(
      Object.assign(new Event("did-start-navigation"), {
        url: "https://subframe.example.test/",
        isMainFrame: false,
      }),
    );
    guest.dispatchEvent(
      Object.assign(new Event("did-start-navigation"), {
        url: "about:blank",
        isMainFrame: true,
      }),
    );
    guest.dispatchEvent(
      Object.assign(new Event("render-process-gone"), {
        details: { reason: "crashed", exitCode: 11 },
      }),
    );
  });
  await waitForAttach(10);
  await page.evaluate(() => {
    window.oldGuest.dispatchEvent(
      Object.assign(new Event("did-start-navigation"), {
        url: "https://stale.example.test/",
        isMainFrame: true,
      }),
    );
    document.querySelector("webview").dispatchEvent(new Event("dom-ready"));
  });
  await page.waitForFunction(() =>
    window.attachmentTest.calls.some((call) => call.kind === "navigate"),
  );
  assert.equal(
    await page.evaluate(
      () => window.attachmentTest.calls.find((call) => call.kind === "navigate").url,
    ),
    "https://studio.example.test/map",
  );
  assert.deepEqual(errors, []);
  console.log("browser guest attachment e2e: OK");
} finally {
  await browser?.close();
  await server.close();
}
