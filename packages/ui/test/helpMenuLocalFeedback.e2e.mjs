import assert from "node:assert/strict";
import { resolve } from "node:path";
import { chromium } from "playwright-core";
import tailwindcss from "@tailwindcss/vite";
import { createServer } from "vite";

const server = await createServer({
  configFile: false,
  root: resolve(import.meta.dirname, "fixtures/help-menu"),
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
  const page = await browser.newPage({ viewport: { width: 560, height: 520 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(server.resolvedUrls.local[0]);

  const openMenu = () => page.getByRole("button", { name: "帮助" }).click();
  await openMenu();
  assert.equal(await page.getByText("产品文档", { exact: true }).count(), 0);
  assert.equal(await page.getByText("用户社群", { exact: true }).count(), 0);
  await page.getByText("问题上报", { exact: true }).click();
  await page.getByTestId("issue-state").getByText("open", { exact: true }).waitFor();

  await openMenu();
  await page.getByText("给产品提需求", { exact: true }).click();
  await page.getByTestId("feature-state").getByText("open", { exact: true }).waitFor();

  await openMenu();
  assert.equal(await page.getByText("资源管理器", { exact: true }).count(), 1);
  assert.equal(await page.getByText("关于 KayingCode", { exact: true }).count(), 1);
  await page.getByText("资源管理器", { exact: true }).click();
  await page.waitForFunction(() => window.fixture.commands.length === 1);
  assert.deepEqual(errors, []);
  console.log("PASS help menu E2E: unavailable links hidden, local feedback forms opened");
} finally {
  await browser?.close();
  await server.close();
}
