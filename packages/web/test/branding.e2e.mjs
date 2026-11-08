import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createServer as createHttpServer } from "node:http";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { chromium } from "playwright-core";
const repo = resolve(import.meta.dirname, "../../..");
const web = resolve(repo, "packages/web");
const { commit } = JSON.parse(await readFile(resolve(web, "upstream-web.json"), "utf8"));
const stage = resolve(repo, ".cache/upstream-web", commit);
const artifacts = resolve(repo, ".tmp/web-branding");
const fixture = resolve(artifacts, "fixture");
await mkdir(fixture, { recursive: true });
const ui = resolve(stage, "packages/ui/src");
const stagedWeb = resolve(stage, "packages/web/src");
await writeFile(
  resolve(fixture, "index.html"),
  '<html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module" src="/fixture.jsx"></script></body></html>',
);
await writeFile(
  resolve(fixture, "style.css"),
  `@import "${ui}/styles.css";\n@source "./fixture.jsx";`,
);
await writeFile(
  resolve(fixture, "fixture.jsx"),
  `
import React from 'react';import {createRoot} from 'react-dom/client';import './style.css';
import {RootStartupLoading} from '/@fs/${ui}/root/RootStartupLoading.tsx';
import {ConversationDraftEmptyState} from '/@fs/${ui}/v4/ConversationDraftEmptyState.tsx';
import {ZCodeIntlProvider} from '/@fs/${ui}/i18n/IntlProvider.tsx';
import {WebRemoteControlBrand} from '/@fs/${stagedWeb}/web-remote-control/ui/webRemoteControlBrand.tsx';
const mode=new URLSearchParams(location.search).get('view');
document.documentElement.className='dark';
createRoot(document.getElementById('root')).render(<ZCodeIntlProvider><main className="min-h-dvh bg-background text-foreground">{mode==='loading'?<RootStartupLoading label="Loading"/>:<><header className="p-4"><WebRemoteControlBrand/></header><div className="flex min-h-96 items-center justify-center px-4"><ConversationDraftEmptyState/></div></>}</main></ZCodeIntlProvider>);
`,
);
const html = await readFile(resolve(web, "dist/index.html"));
const boot = createHttpServer((_request, response) => {
  response.setHeader("content-type", "text/html");
  response.end(html);
});
await new Promise((done) => boot.listen(0, "127.0.0.1", done));
const server = await createServer({
  configFile: false,
  root: fixture,
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": ui } },
  optimizeDeps: { include: ["react", "react-dom/client", "react/jsx-runtime"] },
  server: { host: "127.0.0.1", port: 0, fs: { allow: [repo] } },
});
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.route("**/*.js", (route) => route.abort());
  await page.goto(`http://127.0.0.1:${boot.address().port}/remote/v4`, {
    waitUntil: "domcontentloaded",
  });
  await page.locator('[data-brand="kayingcode"]').waitFor();
  assert.equal(await page.title(), "KayingCode");
  assert.equal(
    await page
      .locator('[data-brand="kayingcode"]')
      .evaluate((img) => img.complete && img.naturalWidth > 0),
    true,
  );
  await page.screenshot({ path: resolve(artifacts, "boot-mobile-dark.png") });
  await page.evaluate(() =>
    document.documentElement.setAttribute("data-zcode-bootstrap-theme", "light"),
  );
  await page.screenshot({ path: resolve(artifacts, "boot-mobile-light.png") });
  await page.unroute("**/*.js");
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${server.resolvedUrls.local[0]}?view=loading`);
  await page.getByTestId("root-startup-loading").locator("img").waitFor();
  assert.equal(await page.getByTestId("root-startup-loading").locator("svg").count(), 0);
  await page.screenshot({ path: resolve(artifacts, "react-loading.png") });
  await page.goto(server.resolvedUrls.local[0]);
  await page.locator('[data-app-logo="kayingcode"]').waitFor();
  assert.equal(await page.locator("header").innerText(), "KayingCode");
  for (const [theme, width] of [
    ["dark", 1180],
    ["light", 1180],
    ["dark", 390],
    ["light", 390],
  ]) {
    await page.setViewportSize({ width, height: 844 });
    await page.evaluate((theme) => {
      document.documentElement.className = theme === "dark" ? "dark" : "";
    }, theme);
    const logo = page.locator(`[data-v4-draft-logo="${theme}"]`);
    await logo.waitFor({ state: "visible" });
    assert.equal(await logo.evaluate((img) => img.complete && img.naturalWidth > 0), true);
    const other = page.locator(`[data-v4-draft-logo="${theme === "dark" ? "light" : "dark"}"]`);
    assert.equal(await other.isVisible(), false);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    await page.screenshot({ path: resolve(artifacts, `home-${theme}-${width}.png`) });
  }
  assert.deepEqual(errors, []);
  await writeFile(
    resolve(artifacts, "result.json"),
    JSON.stringify(
      {
        bootBeforeJS: true,
        reactLoading: true,
        connectionBrand: true,
        themes: ["light", "dark"],
        widths: [390, 1180],
        pageErrors: 0,
      },
      null,
      2,
    ),
  );
  console.log(
    "Web branding: pre-JS boot, React loading, connection header, light/dark and mobile/desktop passed",
  );
} finally {
  await browser?.close();
  await server.close();
  await new Promise((done) => boot.close(done));
}
