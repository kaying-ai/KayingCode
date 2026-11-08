import assert from "node:assert/strict";
import { resolve } from "node:path";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createServer } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { chromium } from "playwright-core";

const server = await createServer({
  configFile: false,
  root: resolve(import.meta.dirname, "fixtures/game-development-plugins"),
  plugins: [tailwindcss()],
  resolve: { alias: { "@": resolve(import.meta.dirname, "../src") } },
  esbuild: { jsx: "automatic" },
  optimizeDeps: { include: ["react", "react-dom/client", "react/jsx-runtime"] },
  server: { host: "127.0.0.1", port: 0, fs: { allow: [resolve(import.meta.dirname, "../../..")] } },
});
const screenshots = resolve(tmpdir(), "kayingcode-game-plugins-qa");
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
  await page.goto(`${url}?examples=1`);
  assert.equal(await page.getByTestId("plugin-store-segment-public").textContent(), "通用");
  await page.getByTestId("plugin-store-segment-game-development").click();
  assert.equal(await page.getByTestId("game-lifecycle-filter").getByRole("button").count(), 7);
  assert.equal(
    await page.getByTestId("game-lifecycle-filter").getByText("生命周期", { exact: true }).count(),
    0,
  );
  assert.equal(await page.getByTestId("game-lifecycle-filter").locator("svg").count(), 0);
  const toolbarGeometry = await page.getByTestId("game-development-toolbar").evaluate((toolbar) => {
    const heading = toolbar.querySelector("h2").getBoundingClientRect();
    const stages = [...toolbar.querySelectorAll("button")].map((button) =>
      button.getBoundingClientRect(),
    );
    return stages.every(
      (stage) => Math.abs(stage.y + stage.height / 2 - heading.y - heading.height / 2) < 2,
    );
  });
  assert.equal(toolbarGeometry, true, "desktop heading and every stage must share one row");
  for (const engine of [
    "taptap-maker",
    "unreal",
    "unity",
    "tuanji",
    "godot",
    "threejs",
    "cocos-creator",
  ]) {
    assert.equal(await page.getByTestId(`game-engine-${engine}`).count(), 1);
  }
  const cards = page.getByTestId("game-development-plugins").getByTestId("plugin-store-card");
  assert.equal(await cards.count(), 5);
  await page.getByTestId("game-stage-discovery").click();
  assert.equal(await cards.count(), 1);
  assert.equal(
    await cards.getAttribute("data-plugin-id"),
    "kaying-game-playtest@kayingcode-plugins-official",
  );
  await cards.getByText("新游发现", { exact: true }).waitFor();
  await cards.getByText("游戏测试", { exact: true }).waitFor();
  await page.getByTestId("game-clear-filters").click();
  assert.equal(await page.getByTestId("game-lifecycle-filter").locator("select").count(), 0);
  await page.getByTestId("game-engine-taptap-maker").click();
  await page.getByTestId("game-stage-publishing").click();
  assert.equal(await cards.count(), 1);
  assert.equal(
    await cards.getAttribute("data-plugin-id"),
    "kaying-for-taptap@kayingcode-plugins-official",
  );
  await page.getByTestId("game-clear-filters").click();
  assert.equal(await page.getByTestId("game-source-open-source").count(), 1);
  assert.equal(await page.getByTestId("game-source-closed-source").count(), 1);
  assert.equal(await page.getByRole("heading", { name: "游戏引擎", exact: true }).count(), 0);
  assert.equal(await page.getByText("源码信息待补充", { exact: true }).count(), 0);
  assert.equal(await page.getByTestId("game-source-unspecified").getByRole("heading").count(), 0);
  assert.equal(
    await page.getByTestId("game-source-unspecified").getByTestId("plugin-store-card").count(),
    3,
  );
  await page.getByTestId("game-plugin-github-banner").click();
  assert.equal(
    await page.getByTestId("external-url").textContent(),
    "https://github.com/example/game-plugin",
  );
  assert.equal(await page.getByTestId("detail-id").count(), 0);
  await page.getByTestId("game-plugin-github-banner").press("Enter");
  assert.equal(await page.getByTestId("detail-id").count(), 0);

  await page.getByTestId("game-engine-unity").click();
  await page.getByTestId("game-stage-testing").click();
  assert.equal(await cards.count(), 2);
  await page.getByTestId("plugin-store-search").fill("Unity");
  assert.equal(await cards.count(), 1);
  const toggle = cards.getByTestId("plugin-store-enabled-switch");
  await toggle.click();
  assert.equal(await toggle.getAttribute("aria-checked"), "false");
  await toggle.press("Space");
  assert.equal(await toggle.getAttribute("aria-checked"), "true");
  assert.equal(await page.getByTestId("detail-id").count(), 0);
  await cards.getByTestId("plugin-store-item-menu").press("Enter");
  await page.getByTestId("plugin-store-menu-enabled").click();
  assert.equal(await toggle.getAttribute("aria-checked"), "false");
  assert.equal(await page.getByTestId("detail-id").count(), 0);
  await cards.press("Enter");
  await page.getByTestId("detail-id").waitFor();
  await page.getByTestId("back-to-market").click();
  assert.equal(await page.getByTestId("game-engine-unity").getAttribute("aria-pressed"), "true");
  assert.equal(await page.getByTestId("game-stage-testing").getAttribute("aria-pressed"), "true");
  await page.getByTestId("plugin-store-segment-personal").click();
  await page.getByTestId("plugin-store-segment-game-development").click();
  assert.equal(await cards.count(), 1);
  await page.getByTestId("game-clear-filters").click();
  await page.getByTestId("game-engine-godot").click();
  await page.getByTestId("game-stage-advertising").click();
  await page.getByTestId("game-plugins-empty").waitFor();
  assert.equal(await cards.count(), 0);
  await page.getByTestId("game-clear-filters").click();
  await page.getByTestId("plugin-store-install").click();
  assert.equal(await cards.getByTestId("plugin-store-install").count(), 0);
  await page.getByTestId("loading-toggle").click();
  await page.getByText("正在加载游戏插件", { exact: true }).waitFor();
  await page.getByTestId("loading-toggle").click();

  await mkdir(screenshots, { recursive: true });
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.mouse.move(0, 0);
  await page.screenshot({
    path: resolve(screenshots, "desktop-source-groups.png"),
    animations: "disabled",
  });
  for (const locale of ["zh-CN", "en-US"]) {
    for (const theme of ["theme-zai-light", "theme-zai-dark"]) {
      await page.goto(`${url}?locale=${locale}&theme=${theme}`);
      assert.equal(
        await page.getByTestId("plugin-store-segment-public").textContent(),
        locale === "zh-CN" ? "通用" : "General",
      );
      await page.getByTestId("plugin-store-segment-game-development").click();
      assert.equal(await cards.count(), 3);
      assert.equal(await page.getByTestId("game-plugin-github-banner").count(), 0);
      await cards.getByTestId("plugin-store-install").click();
      for (const width of [1053, 640, 390]) {
        await page.setViewportSize({ width, height: width === 390 ? 844 : 793 });
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          true,
          `${locale} ${theme} ${width} overflows`,
        );
        const layout = await cards.evaluateAll((nodes) =>
          nodes.map((node) => {
            const card = node.getBoundingClientRect();
            const status = node
              .querySelector('[data-testid="plugin-store-enabled-control"]')
              .getBoundingClientRect();
            const menu = node
              .querySelector('[data-testid="plugin-store-item-menu"]')
              .getBoundingClientRect();
            return {
              y: card.y,
              height: card.height,
              statusInset: status.left - card.left,
              menuInset: card.right - menu.right,
              menuY: menu.y,
            };
          }),
        );
        const firstRow = layout.filter((card) => card.y === layout[0].y);
        assert.equal(firstRow.length, width === 1053 ? 2 : 1);
        assert.equal(new Set(firstRow.map((card) => card.menuY)).size, 1);
        assert.ok(layout.every((card) => card.height <= 148));
        assert.ok(layout.every((card) => card.statusInset === 17 && card.menuInset === 17));
        // 顶部搜索与分段同排：桌面搜索固定 320px 靠右，窄屏换行铺满且左右与列表对齐。
        const controls = await page.evaluate(() => {
          const rect = (testId) =>
            document.querySelector(`[data-testid="${testId}"]`)?.getBoundingClientRect();
          const segment = rect("plugin-store-segment-public");
          const search = rect("plugin-store-search");
          const list = rect("plugin-store-list");
          if (!segment || !search || !list) return null;
          return {
            sameRow: Math.abs(segment.y + segment.height / 2 - (search.y + search.height / 2)) < 2,
            searchWidth: search.width,
            searchLeft: search.left,
            searchRight: search.right,
            segmentLeft: segment.left,
            listLeft: list.left,
            listRight: list.right,
          };
        });
        assert.ok(controls, `${locale} ${theme} ${width} controls missing`);
        const listWidth = controls.listRight - controls.listLeft;
        const wideToolbar = listWidth >= 680;
        assert.equal(controls.sameRow, wideToolbar, `${locale} ${theme} ${width} search row`);
        assert.equal(
          Math.abs(controls.searchRight - controls.listRight) <= 1,
          true,
          `${locale} ${theme} ${width} search right edge`,
        );
        assert.equal(
          Math.abs(controls.segmentLeft - controls.listLeft) <= 1,
          true,
          `${locale} ${theme} ${width} segment left edge`,
        );
        assert.equal(
          Math.abs(controls.searchWidth - (wideToolbar ? 320 : listWidth)) <= 1,
          true,
          `${locale} ${theme} ${width} search width`,
        );
        for (const stage of [
          "all",
          "discovery",
          "development",
          "assets",
          "testing",
          "advertising",
          "publishing",
        ]) {
          assert.equal(await page.getByTestId(`game-stage-${stage}`).isVisible(), true);
        }
        await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
        await page.mouse.move(0, 0);
        await page.screenshot({
          path: resolve(screenshots, `${locale}-${theme}-${width}.png`),
          animations: "disabled",
        });
      }
    }
  }
  await page.goto(`${url}?segment=game-development`);
  await page.getByTestId("game-development-plugins").waitFor();
  await page.getByTestId("game-stage-discovery").click();
  await page.setViewportSize({ width: 1053, height: 793 });
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.mouse.move(0, 0);
  await page.screenshot({
    path: resolve(screenshots, "discovery-zh-CN-dark.png"),
    animations: "disabled",
  });
  assert.deepEqual(errors, []);
  process.stdout.write(`game development E2E passed; screenshots: ${screenshots}\n`);
} finally {
  await browser?.close();
  await server.close();
}
