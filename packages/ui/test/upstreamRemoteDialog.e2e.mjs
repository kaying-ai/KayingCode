import assert from "node:assert/strict";
import { resolve } from "node:path";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright-core";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { createServer } from "vite";
const artifacts = resolve(import.meta.dirname, "../../../.tmp/upstream-remote-dialog");
await mkdir(artifacts, { recursive: true });
const server = await createServer({
  configFile: false,
  root: resolve(import.meta.dirname, "fixtures/upstream-remote-dialog"),
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": resolve(import.meta.dirname, "../src") } },
  optimizeDeps: { include: ["react", "react-dom/client", "react/jsx-runtime"] },
  server: { host: "127.0.0.1", port: 0, fs: { allow: [resolve(import.meta.dirname, "../../..")] } },
});
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 1240, height: 800 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(server.resolvedUrls.local[0]);
  const dialog = page.getByRole("dialog");
  await dialog.locator('img[alt="Web 远程控制二维码"]').waitFor();
  assert.equal(await page.evaluate(() => window.fixture.starts.length), 1);
  assert.deepEqual(await page.evaluate(() => window.fixture.starts[0]), {
    workspacePath: "/fixture",
    workspaceIdentity: "fixture-identity",
    remoteSessionId: "fixture-remote",
    initialTaskId: "fixture-task",
  });
  assert.equal(await page.locator('[data-testid^="web-remote-control-bot-"]').count(), 4);
  assert.equal(
    await page
      .locator('[data-testid^="web-remote-control-bot-"] img')
      .evaluateAll((images) => images.every((image) => image.complete && image.naturalWidth > 0)),
    true,
  );
  const columns = await page
    .getByTestId("web-remote-control-main-grid")
    .evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(" ").length);
  assert.equal(columns, 2);
  await page.screenshot({ path: resolve(artifacts, "desktop-wide.png") });
  await page.getByTestId("mobile-remote-copy").click();
  assert.equal(await page.evaluate(() => window.fixture.copied.length), 1);
  // 同一 Main 连接再次打开应复用；不能每次弹窗重启 Host attachment。
  await page.evaluate(() => window.fixture.open(false));
  await dialog.waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "Open remote" }).click();
  await dialog.waitFor();
  assert.equal(await page.evaluate(() => window.fixture.starts.length), 1);
  // 重开后的状态读取必须完成，二维码才是本次视图的可复制事实。
  await page.getByTestId("mobile-remote-copy").waitFor();
  await page.evaluate(() => {
    window.fixture.holdStart = true;
  });
  await page.getByTestId("mobile-remote-start").click();
  assert.equal(await page.getByTestId("mobile-remote-copy").isDisabled(), true);
  assert.equal(await dialog.locator('img[alt="Web 远程控制二维码"]').count(), 0);
  await page.evaluate(() => window.fixture.open(false));
  await dialog.waitFor({ state: "hidden" });
  await page.evaluate(() => {
    window.fixture.holdStart = false;
    window.fixture.status({
      status: "running",
      sessionId: "current",
      workspacePath: "/fixture",
      workspaceIdentity: "fixture-identity",
      remoteSessionId: "fixture-remote",
      connectUrl: "https://relay.example.test/current",
      qrUrl: "https://relay.example.test/current",
    });
  });
  await page.getByRole("button", { name: "Open remote" }).click();
  await page.getByTestId("mobile-remote-copy").click();
  await page.evaluate(() =>
    window.fixture.releaseStart({
      status: "running",
      sessionId: "stale",
      connectUrl: "https://relay.example.test/stale",
      qrUrl: "https://relay.example.test/stale",
    }),
  );
  await page.getByTestId("mobile-remote-copy").click();
  assert.equal(
    await page.evaluate(() => window.fixture.copied.at(-1)),
    "https://relay.example.test/current",
  );
  // Telegram 快捷入口使用上游真实配置逻辑，但只写隔离的内存 mock。
  await page.getByTestId("web-remote-control-bot-telegram").click();
  await page.getByRole("img", { name: "Telegram BotFather 二维码" }).waitFor();
  assert.deepEqual(await page.evaluate(() => window.fixture.savedBots), ["telegram"]);
  await page.screenshot({ path: resolve(artifacts, "telegram-config.png") });
  await page.keyboard.press("Escape");
  await page.evaluate(() => {
    window.fixture.open(false);
    window.fixture.available(false);
  });
  await page.getByRole("button", { name: "Open remote" }).click();
  assert.equal(await page.getByTestId("web-remote-control-bot-telegram").isDisabled(), true);
  await page.setViewportSize({ width: 480, height: 760 });
  assert.equal(
    await page
      .getByTestId("web-remote-control-main-grid")
      .evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(" ").length),
    1,
  );
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: resolve(artifacts, "narrow.png") });
  await page.evaluate(() => {
    window.fixture.failStop = true;
  });
  await page.getByRole("button", { name: "停止", exact: true }).click();
  await page.getByText("fixture stop failure", { exact: true }).waitFor();
  assert.equal(await dialog.count(), 1);
  await page.evaluate(() => {
    window.fixture.failStop = false;
  });
  await page.getByRole("button", { name: "停止", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  assert.deepEqual(errors, []);
  console.log(
    "PASS upstream remote dialog: official layout, real channel entry, scoped context, refresh/close races, capability, narrow layout and stop failures",
  );
} finally {
  await browser?.close();
  await server.close();
}
