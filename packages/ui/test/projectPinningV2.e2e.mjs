import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { chromium } from "playwright-core";
import { createServer } from "vite";
import tailwindcss from "@tailwindcss/vite";
const fixture = resolve(import.meta.dirname, "fixtures/project-pinning-v2");
// 并行浏览器回归不能共用 Vite 预构建缓存，否则不同 mock alias 会互相失效。
const cacheDir = await mkdtemp(resolve(tmpdir(), "kaying-project-pinning-v2-vite-"));
const server = await createServer({
  cacheDir,
  configFile: false,
  root: fixture,
  plugins: [tailwindcss()],
  resolve: {
    alias: [
      {
        find: "@/project-sidebar/ProjectNodeContent.js",
        replacement: resolve(fixture, "node-content.tsx"),
      },
      ...["i18n/IntlProvider.js", "ControlHintTooltip.js"].map((name) => ({
        find: `@/${name}`,
        replacement: resolve(import.meta.dirname, "fixtures/startup-branding/mocks.tsx"),
      })),
      { find: "@", replacement: resolve(import.meta.dirname, "../src") },
    ],
  },
  esbuild: { jsx: "automatic" },
  server: { host: "127.0.0.1", port: 0, fs: { allow: [resolve(import.meta.dirname, "../../..")] } },
});
async function drag(page, source, target, cancel = false, feedback) {
  await source.click({ trial: true });
  await target.click({ trial: true });
  // 等待真实折叠/展开动画完成后取坐标，避免从仍被裁切的行上开始指针动作。
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => {})),
    ),
  );
  const a = await source.boundingBox();
  const b = await target.boundingBox();
  assert.ok(a && b);
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 10, a.y + a.height / 2, { steps: 3 });
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 15 });
  if (feedback) {
    const preview = page.getByTestId("project-drag-overlay");
    await preview.waitFor();
    assert.match(await preview.textContent(), /alpha-game/);
    assert.equal(
      await source
        .locator("xpath=ancestor::section[1]")
        .evaluate((el) => getComputedStyle(el).opacity),
      "0.25",
    );
    if (feedback === "pin")
      assert.equal(
        await page.getByTestId("sidebar-search-toolbar").getAttribute("data-project-drop-active"),
        "true",
      );
    if (feedback === "reorder") await page.getByTestId("project-drop-indicator").waitFor();
    await page.screenshot({ path: `/tmp/kaying-project-drag-${feedback}.png` });
  }
  if (cancel) await page.keyboard.press("Escape");
  await page.mouse.up();
  if (feedback) await page.getByTestId("project-drag-overlay").waitFor({ state: "detached" });
}
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 600, height: 800 } });
  page.setDefaultTimeout(5000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(server.resolvedUrls.local[0]);
  const source = page.getByTestId("drag-local-one");
  const header = page.getByTestId("sidebar-list-title");
  await source.waitFor({ timeout: 10000 });
  assert.equal(await header.textContent(), "置顶");
  await drag(page, source, header, true, "pin");
  assert.equal(await page.getByTestId("pinned-projects").locator("section").count(), 0);
  await drag(page, source, header);
  await page.getByTestId("pinned-projects").getByTestId("drag-local-one").waitFor();
  assert.equal(await page.getByTestId("project-section").getByTestId("drag-remote-one").count(), 1);
  await page.reload();
  await page.getByTestId("pinned-projects").getByTestId("drag-local-one").waitFor();
  const regular = page
    .getByTestId("project-section")
    .getByRole("button", { name: "项目", exact: true });
  await regular.click();
  await drag(page, source, regular);
  assert.equal(await page.getByTestId("pinned-projects").locator("section").count(), 0);
  // 重载同时验证取消置顶已保存，并避开 dnd-kit 在 pointerup 后短暂抑制 click 的生命周期。
  await page.reload();
  if ((await regular.getAttribute("aria-expanded")) === "false") await regular.click();
  await source.waitFor();
  await drag(page, source, page.getByTestId("drag-local-two"), false, "reorder");
  await page.waitForFunction(
    () =>
      JSON.stringify(
        [
          ...document.querySelectorAll(
            '[data-testid="project-section"] section[data-project-host="local"]',
          ),
        ].map((n) => n.dataset.projectId),
      ) === JSON.stringify(["two", "one"]),
  );
  const names = await page
    .getByTestId("project-section")
    .locator("section[data-project-host=local]")
    .evaluateAll((nodes) => nodes.map((n) => n.dataset.projectId));
  assert.deepEqual(names, ["two", "one"]);
  await page.reload();
  await source.waitFor();
  await page.getByRole("button", { name: "mobile", exact: true }).click();
  await drag(page, source, header);
  assert.equal(await page.getByTestId("pinned-projects").locator("section").count(), 0);
  await page.reload();
  await page.getByTestId("project-section").hover();
  await drag(
    page,
    page.locator('[data-purpose-section-drag-handle="projects"]'),
    page.getByTestId("conversation-section").getByRole("button", { name: "任务", exact: true }),
  );
  await page.waitForFunction(
    () =>
      document
        .querySelector("[data-purpose-section-list] > div:first-child > section")
        ?.getAttribute("data-testid") === "conversation-section",
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS new sidebar: pin/unpin across sections, empty/collapsed drop, cancel, reorder, Host identity, reload, mobile",
  );
} finally {
  await browser?.close();
  await server.close();
  await rm(cacheDir, { recursive: true, force: true });
}
