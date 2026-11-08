import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { createSiteServer } from "../dev.mjs";

// 产品站直接声明浏览器测试依赖，不借用其他应用的 node_modules。
const require = createRequire(import.meta.url);
const { chromium } = require("playwright-core");
const server = createSiteServer();
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const origin = `http://127.0.0.1:${server.address().port}`;
const output = resolve(import.meta.dirname, "../../../.tmp/site-preview");
await mkdir(output, { recursive: true });
let browser;
try {
  browser = await chromium.launch({
    channel:
      process.env.KAYINGCODE_E2E_BROWSER_CHANNEL ??
      (process.platform === "win32" ? "msedge" : "chrome"),
    headless: true,
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(origin);
  await page.getByRole("heading", { level: 1 }).waitFor();
  assert.match(await page.getByRole("heading", { level: 1 }).textContent(), /KayingCode/);
  assert.match(await page.locator("body").textContent(), /基于 ZCode/);
  assert.equal(
    await page
      .getByRole("link", { name: /查看源码/ })
      .first()
      .getAttribute("href"),
    "https://gitee.com/citiao/ZCode",
  );
  assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
  assert.match(await page.locator(".hero-copy").textContent(), /把游戏想法/);
  assert.equal(
    await page.locator(".hero-media img").getAttribute("src"),
    "assets/island-concept.png",
  );
  assert.match(await page.locator(".hero-media figcaption").textContent(), /概念/);
  await page.locator(".hero-primary").click();
  assert.equal(new URL(page.url()).hash, "#start");
  await page.locator(".hero-secondary").click();
  assert.equal(new URL(page.url()).hash, "#how");
  await page.locator(".site-header .brand").click();
  assert.equal(await page.evaluate(() => scrollY), 0);
  await page.getByRole("tab", { name: "03 验证" }).click();
  assert.equal(
    await page.getByRole("tab", { selected: true }).getAttribute("data-stage"),
    "verify",
  );
  assert.match(await page.locator("#stage-title").textContent(), /验证结果/);
  await page.locator("#language-toggle").click();
  assert.equal(await page.locator("html").getAttribute("lang"), "en");
  assert.equal(
    await page.getByRole("tab", { selected: true }).getAttribute("data-stage"),
    "verify",
  );
  assert.match(await page.locator("#stage-title").textContent(), /Verify/);
  assert.match(await page.locator(".hero-media img").getAttribute("alt"), /concept/i);
  await page.locator("#language-toggle").click();
  await page.getByRole("tab", { selected: true }).press("ArrowRight");
  assert.equal(
    await page.getByRole("tab", { selected: true }).getAttribute("data-stage"),
    "iterate",
  );
  await page.getByRole("tab", { selected: true }).press("Home");
  assert.equal(
    await page.getByRole("tab", { selected: true }).getAttribute("data-stage"),
    "create",
  );

  await page.locator("#language-toggle").click();
  assert.equal(await page.locator("html").getAttribute("lang"), "en");
  assert.match(await page.getByRole("heading", { level: 1 }).textContent(), /KayingCode/);
  await page.locator("#theme-toggle").click();
  await page.reload();
  assert.equal(await page.locator("html").getAttribute("data-theme"), "light");
  assert.equal(await page.locator("html").getAttribute("lang"), "en");
  await page.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
  await page.screenshot({ path: resolve(output, "desktop-light-en.png"), fullPage: true });
  await page.locator("#theme-toggle").click();
  await page.locator("#language-toggle").click();

  // 剪贴板的成功和拒绝分别验证；拒绝时不能把按钮投影成成功。
  await page.evaluate(() =>
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text) => {
          window.copiedCommand = text;
        },
      },
    }),
  );
  await page.locator('[data-copy="desktop"]').click();
  assert.match(await page.locator('[data-copy="desktop"]').getAttribute("aria-label"), /已复制/);
  assert.equal(
    await page.evaluate(() => window.copiedCommand),
    "bun run bootstrap\nbun run dev:desktop",
  );
  await page.evaluate(() =>
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async () => {
          throw new Error("denied");
        },
      },
    }),
  );
  await page.locator('[data-copy="web"]').click();
  assert.match(await page.locator("#copy-status").textContent(), /手动复制/);
  await page.locator("#faq").getByText("项目数据和模型请求在哪里？", { exact: true }).click();
  assert.equal(await page.locator("#faq details").first().getAttribute("open"), "");

  const measure = async () => {
    const metrics = await page.evaluate(() => ({
      width: innerWidth,
      scroll: document.documentElement.scrollWidth,
      images: [...document.images]
        .filter((image) => !image.complete || !image.naturalWidth)
        .map((image) => image.src),
      animations: document.getAnimations().filter((animation) => animation.playState === "running")
        .length,
    }));
    assert.ok(metrics.scroll <= metrics.width, JSON.stringify(metrics));
    assert.deepEqual(metrics.images, []);
    assert.equal(metrics.animations, 0);
  };
  await measure();
  await page.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
  await page.screenshot({ path: resolve(output, "desktop-dark.png"), fullPage: true });
  await page.screenshot({ path: resolve(output, "desktop-hero.png") });
  for (const width of [1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await measure();
    if (width > 820) continue;
    await page.locator("#menu-toggle").click();
    assert.equal(await page.locator("#menu-toggle").getAttribute("aria-expanded"), "true");
    await page.locator("#site-navigation").getByRole("link", { name: "开始使用" }).click();
    assert.equal(await page.locator("#menu-toggle").getAttribute("aria-expanded"), "false");
    await page.locator("#language-toggle").click();
    await measure();
    await page.locator("#language-toggle").click();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
  await page.screenshot({ path: resolve(output, "mobile-dark.png"), fullPage: true });
  await page.screenshot({ path: resolve(output, "mobile-hero.png") });
  assert.deepEqual(errors, []);
  await context.close();

  const restricted = await browser.newContext();
  await restricted.addInitScript(() => {
    Storage.prototype.getItem = () => {
      throw new Error("unavailable");
    };
    Storage.prototype.setItem = () => {
      throw new Error("unavailable");
    };
  });
  const restrictedPage = await restricted.newPage();
  await restrictedPage.goto(origin);
  await restrictedPage.locator("#theme-toggle").click();
  assert.equal(await restrictedPage.locator("html").getAttribute("data-theme"), "light");
  await restrictedPage.locator("#language-toggle").click();
  assert.equal(await restrictedPage.locator("html").getAttribute("lang"), "en");
  console.log(
    `Product site E2E passed: workflow, keyboard, locales, themes, mobile menu, clipboard, restricted storage, responsive layout. Screenshots: ${output}`,
  );
} finally {
  await browser?.close();
  await new Promise((done) => server.close(done));
}
