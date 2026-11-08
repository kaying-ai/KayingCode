import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { createServer } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { _electron } from "playwright-core";
import electronPath from "electron";

const fixture = resolve(import.meta.dirname, "fixtures/game-features");
const server = await createServer({
  configFile: false,
  root: fixture,
  plugins: [tailwindcss()],
  resolve: { alias: { "@": resolve(import.meta.dirname, "../src") } },
  esbuild: { jsx: "automatic" },
  server: { host: "127.0.0.1", port: 0, fs: { allow: [resolve(import.meta.dirname, "../../..")] } },
});
let app;
const userData = await mkdtemp(resolve(tmpdir(), "tapmaker-native-e2e-"));
try {
  await server.listen();
  app = await _electron.launch({
    executablePath: electronPath,
    args: [
      `--user-data-dir=${userData}`,
      resolve(fixture, "native-main.cjs"),
      `${server.resolvedUrls.local[0]}?embedded=1`,
    ],
  });
  const page = await app.firstWindow();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.getByTestId("game-center-sidebar-open").click();
  assert.equal(await page.getByRole("dialog").count(), 0);
  await page.getByTestId("game-center-tab-free-token").click();
  await page.waitForFunction(() =>
    document.querySelector("webview")?.getURL()?.includes("embedded.html"),
  );
  const assertGuestScrollsWithoutHostScroll = async () => {
    const metrics = await page.evaluate(() =>
      document.querySelector("webview").executeJavaScript(`(() => {
        const root = document.scrollingElement;
        window.scrollTo({ top: root.scrollHeight, behavior: "instant" });
        return {
          clientHeight: root.clientHeight,
          scrollHeight: root.scrollHeight,
          scrollY: window.scrollY,
        };
      })()`),
    );
    assert.ok(metrics.scrollHeight > metrics.clientHeight);
    assert.ok(metrics.scrollY > 0);
    const hostMetrics = await page.locator("#game-center-panel").evaluate((node) => ({
      clientHeight: node.clientHeight,
      scrollHeight: node.scrollHeight,
    }));
    assert.ok(hostMetrics.scrollHeight <= hostMetrics.clientHeight + 1);
  };
  await assertGuestScrollsWithoutHostScroll();
  const first = await page.evaluate(() => document.querySelector("webview").getWebContentsId());
  await page.getByTestId("game-feature-main").getByRole("button", { name: "返回对话" }).click();
  await page.getByTestId("game-feature-main").waitFor({ state: "hidden" });
  await page.getByTestId("game-center-sidebar-open").click();
  await page.getByTestId("game-center-tab-free-token").click();
  await page.waitForFunction(() =>
    document.querySelector("webview")?.getURL()?.includes("embedded.html"),
  );
  assert.notEqual(
    await page.evaluate(() => document.querySelector("webview").getWebContentsId()),
    first,
  );
  await page.getByTestId("game-center-tab-game-ranking").click();
  await page.waitForFunction(() =>
    document.querySelector("webview")?.getURL()?.includes("embedded.html"),
  );
  await assertGuestScrollsWithoutHostScroll();
  assert.equal(
    await page.evaluate(() => document.querySelector("webview").getTitle()),
    "Embedded feature fixture",
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS native Electron E2E: real webview navigation, close/reopen, page switch, guest-owned content scrolling; external network redirected to fixture",
  );
} finally {
  await app?.close();
  await server.close();
  await rm(userData, { recursive: true, force: true });
}
