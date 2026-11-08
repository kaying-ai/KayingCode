import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { chromium } from "playwright-core";
import { createServer } from "vite";
import tailwindcss from "@tailwindcss/vite";
const fixture = resolve(import.meta.dirname, "fixtures/mode-menu");
// 并行浏览器回归不能共用 Vite 预构建缓存，否则不同 mock alias 会互相失效。
const cacheDir = await mkdtemp(resolve(tmpdir(), "kaying-mode-menu-vite-"));
const server = await createServer({
  cacheDir,
  configFile: false,
  root: fixture,
  plugins: [tailwindcss()],
  resolve: {
    alias: [
      ...["i18n/IntlProvider.js", "ControlHintTooltip.js", "shortcuts/useShortcutBindings.js"].map(
        (name) => ({ find: `@/${name}`, replacement: resolve(fixture, "mocks.tsx") }),
      ),
      { find: "@", replacement: resolve(import.meta.dirname, "../src") },
    ],
  },
  esbuild: { jsx: "automatic" },
  server: { host: "127.0.0.1", port: 0, fs: { allow: [resolve(import.meta.dirname, "../../..")] } },
});
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 600, height: 700 } });
  page.setDefaultTimeout(5000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const [lang, label, description] of [
    ["zh", "自主模式", "有风险时先询问。"],
    ["en", "Autonomous mode", "Ask when there is risk."],
  ]) {
    await page.goto(`${server.resolvedUrls.local[0]}?lang=${lang}`);
    const trigger = page.getByRole("button", {
      name: lang === "zh" ? "切换模式" : "Switch mode",
      exact: true,
    });
    await trigger.click();
    const item = page.getByRole("menuitemradio").filter({ hasText: label });
    await item.waitFor();
    assert.match(await item.textContent(), new RegExp(description));
    assert.equal(await item.locator("svg.lucide-shield-check").count(), 1);
    assert.equal(await page.getByRole("menuitemradio").count(), 3);
    await page.screenshot({ path: `/tmp/kaying-mode-menu-${lang}.png` });
    await item.click();
    assert.equal(JSON.parse(await page.getByTestId("mode-state").textContent()).mode, "guarded");
    await trigger.click();
    assert.equal(
      await page.getByRole("menuitemradio").filter({ hasText: label }).getAttribute("aria-checked"),
      "true",
    );
    await page.getByRole("menuitemcheckbox").click();
    const state = JSON.parse(await page.getByTestId("mode-state").textContent());
    assert.equal(state.mode, "guarded");
    assert.equal(state.planEnabled, true);
  }
  assert.deepEqual(errors, []);
  console.log(
    "PASS mode menu: Chinese/English labels, descriptions, icons, selection and independent Plan toggle",
  );
} finally {
  await browser?.close();
  await server.close();
  await rm(cacheDir, { recursive: true, force: true });
}
