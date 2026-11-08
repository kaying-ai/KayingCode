import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { chromium } from "playwright-core";
import tailwindcss from "@tailwindcss/vite";
import { createServer } from "vite";

const server = await createServer({
  configFile: false,
  root: resolve(import.meta.dirname, "fixtures/contact-section"),
  plugins: [tailwindcss()],
  resolve: { alias: { "@": resolve(import.meta.dirname, "../src") } },
  esbuild: { jsx: "automatic" },
  // 固定构建版本，验证组件读取 define 而不是硬编码或运行时默认值。
  define: {
    __KAYINGCODE_VERSION__: JSON.stringify("1.2.3-qa"),
    __ZCODE_UPSTREAM_VERSION__: JSON.stringify("3.17.2-qa"),
  },
  optimizeDeps: { include: ["react", "react-dom/client", "react/jsx-runtime"] },
  server: { host: "127.0.0.1", port: 0, fs: { allow: [resolve(import.meta.dirname, "../../..")] } },
});
const screenshots = resolve(tmpdir(), "kayingcode-contact-section-qa");
let browser;
try {
  await server.listen();
  browser = await chromium.launch({
    channel:
      process.env.KAYINGCODE_E2E_BROWSER_CHANNEL ??
      (process.platform === "win32" ? "msedge" : "chrome"),
    headless: true,
  });
  const page = await browser.newPage({ viewport: { width: 1053, height: 793 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const url = server.resolvedUrls.local[0];

  await page.goto(url);
  const region = page.getByRole("region", { name: "联系我们" });
  await region.waitFor();
  await region.getByText("service@kayingai.com", { exact: true }).waitFor();
  assert.equal(await region.getByText("KayingCode 构建版本号", { exact: true }).count(), 1);
  assert.equal(await region.getByText("ZCode 构建版本号", { exact: true }).count(), 1);
  assert.equal(await region.getByText("1.2.3-qa", { exact: true }).count(), 1);
  assert.equal(await region.getByText("3.17.2-qa", { exact: true }).count(), 1);
  await region.getByRole("button", { name: "访问官网" }).click();
  assert.equal(await page.evaluate(() => window.__openedExternal), "https://kayingai.com");

  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await region.count(), 1, "contact section must render once");
  assert.equal(await page.getByText("客服二维码", { exact: true }).count(), 1);
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    true,
    "mobile contact section overflows",
  );
  await mkdir(screenshots, { recursive: true });
  // 视口变窄后等一帧稳定再截图，避免把旧布局的合成残影写进证据图。
  await page.waitForTimeout(400);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.mouse.move(0, 0);
  await page.screenshot({
    path: resolve(screenshots, "contact-section-mobile.png"),
    animations: "disabled",
  });

  await page.setViewportSize({ width: 1053, height: 793 });
  await page.goto(`${url}?locale=en-US&theme=theme-zai-light`);
  const englishRegion = page.getByRole("region", { name: "Contact us" });
  await englishRegion.getByText("Contact email", { exact: true }).waitFor();
  assert.equal(
    await englishRegion.getByText("KayingCode build version", { exact: true }).count(),
    1,
  );
  assert.equal(await englishRegion.getByText("ZCode build version", { exact: true }).count(), 1);
  await page.screenshot({
    path: resolve(screenshots, "contact-section-en-light.png"),
    animations: "disabled",
  });

  assert.deepEqual(errors, []);
  process.stdout.write(`Contact section E2E passed; screenshots: ${screenshots}\n`);
} finally {
  await browser?.close();
  await server.close();
}
