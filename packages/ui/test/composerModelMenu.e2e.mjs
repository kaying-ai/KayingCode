import assert from "node:assert/strict";
import { resolve } from "node:path";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { chromium } from "playwright-core";
import { tmpdir } from "node:os";
import tailwindcss from "@tailwindcss/vite";
import { createServer } from "vite";
const root = resolve(import.meta.dirname, "fixtures/composer-model-menu"),
  artifacts = resolve(import.meta.dirname, "../../../.tmp/composer-model-menu");
await mkdir(artifacts, { recursive: true });
const cacheDir = await mkdtemp(resolve(tmpdir(), "kaying-composer-menu-vite-"));
const server = await createServer({
  cacheDir,
  configFile: false,
  root,
  plugins: [tailwindcss()],
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: [
      ...[
        "hooks/useKayingCodeConfig.js",
        "hooks/useProviderSettingsView.js",
        "hooks/useSettingService.js",
        "store/TabStoreProvider.js",
        "shortcuts/useShortcutBindings.js",
        "v4/composer/toolbarShortcuts.js",
        "v4/composer/V4ComposerModeControls.js",
      ].map((name) => ({ find: `@/${name}`, replacement: resolve(root, "toolbar-mocks.tsx") })),
      { find: "@", replacement: resolve(import.meta.dirname, "../src") },
    ],
  },
  optimizeDeps: { include: ["react", "react-dom/client", "react/jsx-runtime"] },
  server: { host: "127.0.0.1", port: 0, fs: { allow: [resolve(import.meta.dirname, "../../..")] } },
});
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({
      viewport: { width: 1180, height: 800 },
      reducedMotion: "reduce",
    }),
    errors = [],
    controlWarnings = [];
  page.setDefaultTimeout(10000);
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (message) => {
    if (/changing from .*controlled/.test(message.text())) controlWarnings.push(message.text());
  });
  await page.goto(server.resolvedUrls.local[0]);
  const trigger = page.getByTestId("chat-model-select-trigger");
  await trigger.click();
  const slider = page.getByTestId("composer-thought-slider");
  await slider.waitFor();
  assert.equal(await slider.getAttribute("aria-valuetext"), "High");
  await slider.focus();
  await page.keyboard.press("Home");
  assert.match(await page.getByTestId("selection").textContent(), /low$/);
  await page.keyboard.press("End");
  assert.match(await page.getByTestId("selection").textContent(), /xhigh$/);
  await page.getByRole("menuitemradio", { name: "Second model", exact: false }).click();
  assert.equal(await slider.isVisible(), true);
  assert.equal(await slider.getAttribute("aria-valuetext"), "—");
  await slider.focus();
  await page.keyboard.press("Home");
  assert.match(await page.getByTestId("selection").textContent(), /^a\/second:low$/);
  await page.screenshot({ path: resolve(artifacts, "desktop-menu.png") });
  await page.mouse.click(20, 30);
  await slider.waitFor({ state: "hidden" });
  await page.waitForFunction(
    () => document.querySelector('[data-testid="v4-composer-input"]') === document.activeElement,
  );
  await trigger.click();
  await page.keyboard.press("Escape");
  await slider.waitFor({ state: "hidden" });
  await page.setViewportSize({ width: 390, height: 844 });
  await trigger.click();
  await page.getByTestId("composer-provider-trigger").click();
  await page.getByTestId("composer-provider-back").waitFor();
  await page.getByRole("menuitemradio", { name: "Personal API", exact: true }).click();
  await slider.waitFor();
  assert.match(await page.getByTestId("selection").textContent(), /^b\/custom:/);
  const bounds = await slider.boundingBox();
  assert.ok(bounds);
  await page.mouse.move(bounds.x + 8, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width - 8, bounds.y + bounds.height / 2, { steps: 8 });
  await page.mouse.up();
  assert.match(await page.getByTestId("selection").textContent(), /xhigh$/);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: resolve(artifacts, "mobile-menu.png") });
  await page.mouse.click(20, 30);
  await page.evaluate(() => window.fixture.fixed());
  await trigger.click();
  assert.equal(await page.getByTestId("composer-thought-slider").count(), 0);
  await page.keyboard.press("Escape");
  await page.evaluate(() => window.fixture.disable());
  await page.waitForFunction(
    () => document.querySelector('[data-testid="chat-model-select-trigger"]')?.disabled === true,
  );
  await page.goto(`${server.resolvedUrls.local[0]}integration.html`);
  await trigger.click();
  await page.getByRole("menuitemradio", { name: "second", exact: true }).click();
  await slider.waitFor();
  await slider.focus();
  await page.keyboard.press("End");
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: resolve(artifacts, "actual-toolbar-mobile.png") });
  const calls = await page.evaluate(() => window.integration.calls);
  assert.deepEqual(calls, [
    {
      kind: "model",
      provider: "fixture-api",
      model: "second",
      source: { provider: "fixture-api", model: "first" },
    },
    { kind: "thought", thought: "xhigh", target: { provider: "fixture-api", model: "second" } },
  ]);
  await page.keyboard.press("Escape");
  await page.getByTestId("submit").click();
  assert.deepEqual(JSON.parse(await page.getByTestId("submission").textContent()), {
    mode: "build",
    planEnabled: false,
    modelSelection: {
      providerId: "fixture-api",
      modelId: "second",
      options: { reasoningLevel: "xhigh" },
    },
  });
  await page.evaluate(() => window.integration.loading());
  await page.waitForFunction(
    () => document.querySelector('[data-testid="chat-model-select-trigger"]')?.disabled === true,
  );
  await page.evaluate(() => window.integration.error());
  await page.getByRole("button", { name: /retry/i }).click();
  await page.waitForFunction(
    () => document.querySelector('[data-testid="chat-model-select-trigger"]')?.disabled === false,
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(controlWarnings, []);
  await writeFile(
    resolve(artifacts, "result.json"),
    JSON.stringify(
      {
        combinedMenu: true,
        keyboardEffort: true,
        modelRetainsMenu: true,
        missingThought: true,
        providerSwitch: true,
        mobile: true,
        fixedThought: true,
        disabled: true,
        actualToolbar: true,
        submissionConfig: true,
        loadingAndRetry: true,
        pageErrors: 0,
      },
      null,
      2,
    ),
  );
  console.log(
    "Composer menu: model/provider, effort keyboard, missing/fixed selection, focus, mobile and disabled passed",
  );
} finally {
  await browser?.close();
  await server.close();
  await rm(cacheDir, { recursive: true, force: true });
}
