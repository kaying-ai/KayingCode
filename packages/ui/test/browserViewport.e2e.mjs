import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright-core";
import { createServer } from "vite";

export async function startViewportFixture() {
  const require = createRequire(
    new URL("../../../packages/desktop/package.json", import.meta.url),
  );
  const { default: tailwindcss } = await import(
    pathToFileURL(require.resolve("@tailwindcss/vite")).href
  );
  const mocks = resolve(import.meta.dirname, "fixtures/browser-viewport/mocks.jsx");
  const server = await createServer({
    configFile: false,
    root: resolve(import.meta.dirname, "fixtures/browser-viewport"),
    plugins: [tailwindcss()],
    resolve: {
      alias: [
        ...["hooks/usePlatform.js", "i18n/IntlProvider.js", "logger.js"].map((name) => ({
          find: `@/${name}`,
          replacement: mocks,
        })),
        { find: "@", replacement: resolve(import.meta.dirname, "../src") },
      ],
    },
    esbuild: { jsx: "automatic" },
    server: {
      host: "127.0.0.1",
      port: 0,
      fs: { allow: [resolve(import.meta.dirname, "../../..")] },
    },
  });
  await server.listen();
  return server;
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const server = await startViewportFixture();
  let browser;
  try {
    browser = await chromium.launch({
      channel: process.platform === "win32" ? "msedge" : "chrome",
      headless: true,
    });
    const page = await browser.newPage({ viewport: { width: 600, height: 900 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(server.resolvedUrls.local[0]);
    const width = page.getByTestId("browser-responsive-width-input"),
      height = page.getByTestId("browser-responsive-height-input");
    await width.waitFor();
    const frame = page.frameLocator("iframe");
    await frame.getByLabel("文档标记").fill("manual-edit-kept");
    await page.evaluate(() => (window.originalFrame = document.querySelector("iframe")));
    await page.getByRole("button", { name: "切换为竖屏", exact: true }).click();
    assert.equal(await width.inputValue(), "720");
    assert.equal(await height.inputValue(), "1280");
    assert.deepEqual(await page.evaluate(() => window.viewportTest.calls.at(-1).viewport), {
      width: 720,
      height: 1280,
    });
    await page.getByRole("button", { name: "切换为横屏", exact: true }).click();
    assert.equal(await width.inputValue(), "1280");
    assert.equal(await height.inputValue(), "720");
    await width.fill("not-a-number");
    await page.getByRole("button", { name: "切换为竖屏", exact: true }).click();
    assert.equal(await width.inputValue(), "720");
    assert.equal(await height.inputValue(), "1280");
    assert.equal(await width.getAttribute("aria-invalid"), null);
    const artifacts = resolve(import.meta.dirname, "../../../.kayingcode-runtime/browser-viewport");
    await mkdir(artifacts, { recursive: true });
    await page.screenshot({ path: resolve(artifacts, "portrait.png") });
    await page.getByRole("button", { name: "填满面板", exact: true }).click();
    assert.equal(await page.getByTestId("browser-responsive-toolbar").count(), 0);
    assert.equal(await page.evaluate(() => window.viewportTest.calls.at(-1).viewport), null);
    const metrics = await page.evaluate(() => {
      const panel = document.querySelector("[data-testid=available-panel]").getBoundingClientRect();
      const frame = document.querySelector("iframe").getBoundingClientRect();
      return {
        panel: { width: panel.width, height: panel.height },
        frame: { width: frame.width, height: frame.height },
        same: window.originalFrame === document.querySelector("iframe"),
      };
    });
    assert.deepEqual(metrics.frame, metrics.panel);
    assert.equal(metrics.same, true);
    assert.equal(await frame.getByLabel("文档标记").inputValue(), "manual-edit-kept");
    await page.screenshot({ path: resolve(artifacts, "fill-panel.png") });
    await page.getByTestId("enter-fixed").click();
    assert.equal(await width.inputValue(), "720");
    assert.equal(await height.inputValue(), "1280");
    await page.evaluate(() => window.viewportTest.setSize({ width: 3840, height: 720 }));
    await page.waitForFunction(
      () => document.querySelector("[data-testid=browser-responsive-width-input]").value === "3840",
    );
    assert.equal(await page.getByTestId("browser-responsive-rotate").isDisabled(), true);
    await page.evaluate(() => window.viewportTest.setSize({ width: 720, height: 720 }));
    await page.waitForFunction(
      () => document.querySelector("[data-testid=browser-responsive-width-input]").value === "720",
    );
    assert.equal(await page.getByTestId("browser-responsive-rotate").isDisabled(), true);
    await page.evaluate(() => {
      window.viewportTest.setSize({ width: 1280, height: 720 });
      window.viewportTest.setLocale("en");
    });
    await page.getByRole("button", { name: "Switch to portrait", exact: true }).click();
    assert.equal(await width.inputValue(), "720");
    await page.getByRole("button", { name: "Switch to landscape", exact: true }).press("Enter");
    assert.equal(await width.inputValue(), "1280");
    assert.match(await page.getByTestId("browser-responsive-zoom-select").innerText(), /Fit/);
    for (const theme of ["light", "dark"]) {
      await page.evaluate((theme) => {
        document.documentElement.className = `theme-zai-${theme}`;
      }, theme);
      assert.equal(
        await page
          .getByTestId("browser-responsive-toolbar")
          .evaluate((element) => getComputedStyle(element).backgroundColor),
        theme === "dark" ? "rgb(22, 22, 22)" : "rgb(248, 248, 248)",
      );
    }
    await page.setViewportSize({ width: 360, height: 800 });
    assert.equal(await page.evaluate(() => document.body.scrollWidth > innerWidth), false);
    assert.deepEqual(errors, []);
    console.log(`browser viewport e2e: OK; screenshots: ${artifacts}`);
  } finally {
    await browser?.close();
    await server.close();
  }
}
