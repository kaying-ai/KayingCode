import assert from "node:assert/strict";
import { resolve } from "node:path";
import { createServer } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { chromium } from "playwright-core";

const server = await createServer({
  configFile: false,
  root: resolve(import.meta.dirname, "fixtures/plugin-store-enablement"),
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
  const page = await browser.newPage({ viewport: { width: 900, height: 360 } });
  await page.goto(server.resolvedUrls.local[0]);

  // 旧 Helper 设置入口退役后，原生插件仍可从插件管理页启停。
  await page
    .getByTestId("legacy-computer-use-section")
    .getByText("false", { exact: true })
    .waitFor();

  const manageButton = page.getByTestId("plugin-store-manage-open");
  await manageButton.getByText("管理已安装", { exact: true }).waitFor();
  assert.equal(await page.getByTestId("plugin-store-installed-strip").count(), 0);
  await manageButton.click();
  assert.equal(await page.getByTestId("managed-count").textContent(), "1");

  const control = page.getByTestId("plugin-store-enabled-control");
  const toggle = page.getByTestId("plugin-store-enabled-switch");
  await control.getByText("已停用", { exact: true }).waitFor();
  assert.equal(await toggle.getAttribute("aria-label"), "启用 电脑控制");

  await toggle.click();
  await control.getByText("已启用", { exact: true }).waitFor();
  assert.equal(await control.getAttribute("data-enabled"), "true");
  assert.equal(await page.getByTestId("opened-count").textContent(), "0");

  await toggle.focus();
  await page.keyboard.press("Space");
  await control.getByText("已停用", { exact: true }).waitFor();
  assert.equal(await page.getByTestId("opened-count").textContent(), "0");

  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
} finally {
  await browser?.close();
  await server.close();
}
