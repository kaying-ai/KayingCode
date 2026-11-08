import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright-core";
import { createServer } from "vite";
import tailwindcss from "@tailwindcss/vite";

const root = resolve(import.meta.dirname, "../../..");
const fixture = resolve(import.meta.dirname, "fixtures/startup-branding");
const server = await createServer({
  configFile: false,
  root: fixture,
  plugins: [tailwindcss()],
  resolve: {
    alias: [
      ...["i18n/IntlProvider.js", "ControlHintTooltip.js"].map((name) => ({
        find: `@/${name}`,
        replacement: resolve(fixture, "mocks.tsx"),
      })),
      { find: "@", replacement: resolve(root, "packages/ui/src") },
    ],
  },
  esbuild: { jsx: "automatic" },
  server: { host: "127.0.0.1", port: 0, fs: { allow: [root] } },
});
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(server.resolvedUrls.local[0]);
  const title = page.getByTestId("sidebar-list-title");
  await title.waitFor();
  for (const width of [390, 1200]) {
    await page.setViewportSize({ width, height: 800 });
    for (const theme of ["light", "dark"]) {
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "no-preference" });
      const positions = await page.evaluate(() => {
        const elements = [
          document.querySelector('[data-testid="sidebar-list-title"]'),
          ...document.querySelectorAll(
            '[data-purpose-section-list] button[data-slot="collapsible-trigger"] > span',
          ),
        ];
        return elements.map((element) => {
          const range = document.createRange();
          range.selectNodeContents(element);
          return range.getBoundingClientRect().left;
        });
      });
      assert.equal(positions.length, 3);
      assert.deepEqual(positions, [18, 18, 18]);
    }
  }
  const project = page
    .getByTestId("project-section")
    .getByRole("button", { name: "项目", exact: true });
  const before = await project.getAttribute("aria-expanded");
  await project.click();
  assert.notEqual(await project.getAttribute("aria-expanded"), before);
  const logo = page.locator('[data-testid="animated-logo"] .startup-logo-shell');
  const angle = (target) =>
    target.evaluate((element) =>
      getComputedStyle(element, "::after").getPropertyValue("--startup-beam-angle"),
    );
  await logo.screenshot({ path: "/tmp/kaying-startup-logo.png" });
  const firstAngle = await angle(logo);
  await page.waitForTimeout(200);
  assert.notEqual(await angle(logo), firstAngle);
  assert.equal(
    await page
      .locator('[data-testid="static-logo"] .startup-logo-shell')
      .evaluate((el) => getComputedStyle(el, "::after").animationName),
    "none",
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  assert.equal(await logo.evaluate((el) => getComputedStyle(el, "::after").animationName), "none");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  // 直接运行真实 HTML 首屏的样式和门禁；仅去掉应用入口与统计脚本，隔离服务启动。
  const html = (await readFile(resolve(root, "packages/desktop/src/renderer/index.html"), "utf8"))
    .replace(/<script>\s*var _hmt[\s\S]*?<\/script>/, "")
    .replace(/<script type="module" src="\.\/src\/main.tsx"><\/script>/, "");
  await page.route("**/desktop-startup", (route) =>
    route.fulfill({ contentType: "text/html", body: html }),
  );
  await page.goto(`${server.resolvedUrls.local[0]}desktop-startup`);
  const splash = page.locator(".startup-logo-shell");
  const initialAngle = await angle(splash);
  await page.waitForTimeout(200);
  assert.notEqual(await angle(splash), initialAngle);
  assert.equal(await page.locator("#loading").count(), 1);
  await page.evaluate(() => window.dispatchEvent(new Event("kayingcode-react-startup-ready")));
  await page.locator("#loading").waitFor({ state: "detached" });
  assert.equal(
    await page.locator("body").evaluate((el) => el.classList.contains("kayingcode-startup-ready")),
    true,
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`${server.resolvedUrls.local[0]}desktop-startup`);
  assert.equal(
    await splash.evaluate((el) => getComputedStyle(el, "::after").animationName),
    "none",
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS sidebar alignment/collapse, React and HTML border motion, static/reduced motion, startup handoff",
  );
} finally {
  await browser?.close();
  await server.close();
}
