import assert from "node:assert/strict";
import { readFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { createServer } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { chromium } from "playwright-core";
import { enumeratePluginComponents } from "../../agent-adapters/src/plugins/plugin-components.ts";
import { parseEntryStoreListing } from "../../agent-adapters/src/plugins/marketplace.ts";

const root = resolve(import.meta.dirname, "../../..");
const catalog = JSON.parse(await readFile(resolve(root, "config/official-plugins.json"), "utf8"));
const data = await Promise.all(
  catalog.plugins
    .filter((plugin) => plugin.listing)
    .map(async (plugin) => {
      const pluginRoot = resolve(root, plugin.sourceRoot);
      const manifest = await readFile(resolve(pluginRoot, ".kayingcode-plugin/plugin.json"), "utf8")
        .then(JSON.parse)
        .catch(() => null);
      return {
        name: plugin.name,
        listing: parseEntryStoreListing(plugin.listing),
        components: enumeratePluginComponents(pluginRoot, manifest),
      };
    }),
);
const server = await createServer({
  configFile: false,
  root: resolve(import.meta.dirname, "fixtures/plugin-skill-details"),
  plugins: [
    tailwindcss(),
    {
      name: "actual-plugin-components",
      resolveId(id) {
        if (id === "virtual:plugin-detail-data") return "\0plugin-detail-data";
      },
      load(id) {
        if (id === "\0plugin-detail-data") return `export default ${JSON.stringify(data)}`;
      },
    },
  ],
  resolve: { alias: { "@": resolve(root, "packages/ui/src") } },
  esbuild: { jsx: "automatic" },
  optimizeDeps: { include: ["react", "react-dom/client", "react/jsx-runtime"] },
  server: {
    host: "127.0.0.1",
    port: process.argv.includes("--preview") ? 5188 : 0,
    fs: { allow: [root] },
  },
});
const screenshots = resolve(tmpdir(), "kayingcode-plugin-skill-details-qa");
if (process.argv.includes("--preview")) {
  await server.listen();
  server.printUrls();
  await new Promise(() => {});
}
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
  const base = server.resolvedUrls.local[0];
  for (const plugin of data) {
    await page.goto(`${base}?plugin=${plugin.name}`);
    const skills = plugin.components.find((group) => group.kind === "skill")?.items ?? [];
    assert.equal(await page.getByTestId("plugin-skill-detail").count(), skills.length, plugin.name);
    const subskills =
      plugin.listing?.skillDetails?.reduce(
        (count, skill) => count + (skill.subskills?.length ?? 0),
        0,
      ) ?? 0;
    assert.equal(await page.getByTestId("plugin-subskill").count(), subskills, plugin.name);
  }
  await mkdir(screenshots, { recursive: true });
  for (const locale of ["zh-CN", "en-US"])
    for (const theme of ["theme-zai-dark", "theme-zai-light"]) {
      for (const mode of ["installed", "describe"]) {
        await page.goto(
          `${base}?plugin=blender&locale=${locale}&theme=${theme}&mode=${mode}&disabled=1`,
        );
        assert.equal(await page.getByTestId("plugin-skill-detail").count(), 1);
        assert.equal(await page.getByTestId("plugin-subskill").count(), 10);
        const last = page.getByTestId("plugin-subskill").last();
        await last.scrollIntoViewIfNeeded();
        assert.equal(await last.isVisible(), true);
        for (const width of [1053, 390]) {
          await page.setViewportSize({ width, height: width === 390 ? 844 : 793 });
          assert.equal(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
            true,
            `${locale}/${theme}/${mode}/${width}`,
          );
          assert.equal(
            await page
              .getByTestId("plugin-skill-detail")
              .evaluate((node) =>
                [...node.querySelectorAll("p")].every(
                  (p) => getComputedStyle(p).webkitLineClamp === "none",
                ),
              ),
            true,
          );
          await page
            .locator('[data-component-kind="skill"]')
            .evaluate((node) => node.scrollIntoView({ block: "start", behavior: "instant" }));
          await page.screenshot({
            path: resolve(screenshots, `${locale}-${theme}-${mode}-${width}.png`),
            animations: "disabled",
          });
        }
      }
    }
  await page.goto(`${base}?plugin=blender&legacy=1`);
  assert.equal(await page.getByTestId("plugin-skill-detail").count(), 1);
  assert.equal(await page.getByTestId("plugin-subskill").count(), 0);
  assert.deepEqual(errors, []);
  process.stdout.write(
    `builtin skill detail E2E passed: ${data.length} plugins; screenshots: ${screenshots}\n`,
  );
} finally {
  await browser?.close();
  await server.close();
}
