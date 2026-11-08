import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer as createHttpServer } from "node:http";
import { _electron } from "playwright-core";
import { createServer } from "vite";

const root = await mkdtemp(join(tmpdir(), "browser-native-recovery-"));
const mocks = resolve(import.meta.dirname, "fixtures/browser-guest-attachment/mocks.jsx");
const mocked = [
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
      ...mocked.map((name) => ({ find: `@/${name}`, replacement: mocks })),
      { find: "@", replacement: resolve(import.meta.dirname, "../src") },
    ],
  },
  esbuild: { jsx: "automatic" },
  server: { host: "127.0.0.1", port: 0, fs: { allow: [resolve(import.meta.dirname, "../../..")] } },
});
let requests = 0;
const targetServer = createHttpServer((_, res) => {
  requests++;
  if (requests === 1) return; // 首个文档保持未提交，直到强制退出；替代 guest 请求会正常返回。
  res.writeHead(200, { "Content-Type": "text/html" });
  res.end("<!doctype html><title>Recovered Studio</title><h1>Recovered</h1>");
});
let app;
try {
  await server.listen();
  await new Promise((resolve) => targetServer.listen(0, "127.0.0.1", resolve));
  const target = `http://127.0.0.1:${targetServer.address().port}/first-navigation`;
  const require = createRequire(
    new URL("../../../packages/desktop/package.json", import.meta.url),
  );
  const env = {
    ...process.env,
    BROWSER_RECOVERY_PROFILE: root,
    BROWSER_RECOVERY_TARGET: target,
    BROWSER_RECOVERY_FIXTURE: `${server.resolvedUrls.local[0]}?native=1`,
  };
  delete env.ELECTRON_RUN_AS_NODE;
  app = await _electron.launch({
    executablePath: require("electron"),
    args: [resolve(import.meta.dirname, "fixtures/browser-guest-attachment/electron.cjs")],
    env,
    timeout: 30000,
  });
  const page = await app.firstWindow();
  await page.waitForFunction(() =>
    window.attachmentTest?.calls.some((call) => call.kind === "residency"),
  );
  const before = await page.evaluate(() => document.querySelector("webview").getWebContentsId());
  await page.evaluate((target) => {
    document
      .querySelector("webview")
      .loadURL(target)
      .catch(() => {});
  }, target);
  await page.waitForFunction(
    (target) => {
      const guest = document.querySelector("webview");
      try {
        return guest?.getURL() === target;
      } catch {
        return false;
      }
    },
    target,
    { timeout: 20000 },
  );
  const after = await page.evaluate(() => document.querySelector("webview").getWebContentsId());
  assert.notEqual(after, before);
  assert.ok(requests >= 2);
  assert.equal(
    await page.evaluate(() => document.querySelector("webview").getTitle()),
    "Recovered Studio",
  );
  console.log("native Electron first-navigation crash → same-target recovery: OK");
} finally {
  await app?.close();
  await server.close();
  targetServer.closeAllConnections();
  await new Promise((resolve) => targetServer.close(resolve));
  await rm(root, { recursive: true, force: true });
}
