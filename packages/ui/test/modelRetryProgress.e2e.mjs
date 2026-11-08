import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { chromium } from "playwright-core";
import tailwindcss from "@tailwindcss/vite";
import { createServer } from "vite";

const server = await createServer({
  configFile: false,
  root: resolve(import.meta.dirname, "fixtures/model-retry-progress"),
  plugins: [tailwindcss()],
  resolve: { alias: { "@": resolve(import.meta.dirname, "../src") } },
  esbuild: { jsx: "automatic" },
  optimizeDeps: { include: ["react", "react-dom/client", "react/jsx-runtime"] },
  server: { host: "127.0.0.1", port: 0, fs: { allow: [resolve(import.meta.dirname, "../../..")] } },
});
let browser;
try {
  await server.listen();
  browser = await chromium.launch({
    channel:
      process.env.KAYINGCODE_E2E_BROWSER_CHANNEL ??
      (process.platform === "win32" ? "msedge" : "chrome"),
    headless: true,
  });
  for (const width of [375, 1200]) {
    const page = await browser.newPage({ viewport: { width, height: 400 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.clock.install({ time: new Date("2026-10-21T10:00:00Z") });
    await page.clock.pauseAt(new Date("2026-10-21T10:00:01Z"));
    await page.goto(server.resolvedUrls.local[0]);
    const area = page.getByTestId("loading-area");
    await page.getByRole("button", { name: "Retry 60", exact: true }).click();
    await area.getByText("模型请求重试 · 60 秒后继续 · 1/10", { exact: true }).waitFor();
    await page.clock.runFor(2000);
    assert.match(await area.innerText(), /58 秒后继续/);
    await page.clock.runFor(58000);
    assert.equal((await area.innerText()).trim(), "正在重试模型请求 · 1/10");
    await page.clock.runFor(120000);
    await page.getByRole("button", { name: "Expired 3", exact: true }).click();
    await area.getByText("正在重试模型请求 · 3/10", { exact: true }).waitFor();

    // 绝对时间戳来自恢复快照，不因组件重新挂载重置成完整退避时长。
    await page.getByRole("button", { name: "Replay 15", exact: true }).click();
    await area.getByText("模型请求重试 · 15 秒后继续 · 1/10", { exact: true }).waitFor();
    await page.clock.runFor(5000);
    await page.getByRole("button", { name: "English", exact: true }).click();
    await area.getByText("Model retry · resumes in 10s · 1/10", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Expired 3", exact: true }).click();
    await area.getByText("Retrying model request · 3/10", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Retry 60", exact: true }).click();
    await area.getByText("Model retry · resumes in 60s · 1/10", { exact: true }).waitFor();
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
      false,
      `retry label overflows at ${width}px`,
    );
    await page.screenshot({ path: resolve(tmpdir(), `kayingcode-model-retry-${width}.png`) });
    await page.getByRole("button", { name: "Recovered", exact: true }).click();
    await page.getByTestId("chat-loading").waitFor();
    assert.doesNotMatch(await area.innerText(), /retry|重试/i);
    await page.getByRole("button", { name: "End", exact: true }).click();
    assert.equal(await area.locator('[data-kayingcode-chat-loading-slot="true"]').count(), 0);
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log("model retry progress e2e ok: first retry, countdown, replay, recovery, phone/en/zh");
} finally {
  await browser?.close();
  await server.close();
}
