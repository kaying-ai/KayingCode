import assert from "node:assert/strict";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright-core";
import { createServer } from "vite";

const require = createRequire(
  new URL("../../../packages/desktop/package.json", import.meta.url),
);
const { default: tailwindcss } = await import(
  pathToFileURL(require.resolve("@tailwindcss/vite")).href
);
const mocked = [
  "i18n/IntlProvider.js",
  "store/kayingcodeSessionStore.js",
  "hooks/useWorkspaceServices.js",
  "hooks/useConfirmDialog.js",
  "TaskList.js",
  "logger.js",
  "settings/RemoteSyncActions.js",
  "store/taskQueryCacheStore.js",
  "store/remotePinnedTaskStore.js",
  "store/remoteTimelineTaskStore.js",
  "store/mcpStore.js",
  "lib/kayingcodeDraftSkillInvalidation.js",
  "lib/skillStoreRefresh.js",
  "lib/remotePluginSyncRefresh.js",
  "lib/workspaceRuntimeRelease.js",
  "lib/workspaceRemovalSafety.js",
  "components/ui/toast.js",
];
const server = await createServer({
  configFile: false,
  root: resolve(import.meta.dirname, "fixtures/workspace-connection"),
  plugins: [tailwindcss()],
  resolve: {
    alias: [
      ...mocked.map((name) => ({
        find: `@/${name}`,
        replacement: resolve(import.meta.dirname, "fixtures/workspace-connection/mocks.jsx"),
      })),
      { find: "@", replacement: resolve(import.meta.dirname, "../src") },
    ],
  },
  esbuild: { jsx: "automatic" },
  server: { host: "127.0.0.1", port: 0, fs: { allow: [resolve(import.meta.dirname, "../../..")] } },
});
let browser;
try {
  await server.listen();
  browser = await chromium.launch({
    channel: process.platform === "win32" ? "msedge" : "chrome",
    headless: true,
  });
  const page = await browser.newPage({ viewport: { width: 420, height: 760 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto(server.resolvedUrls.local[0]);
  const row = page.getByText("Scene project", { exact: true });
  await row.waitFor();
  const draft = page.getByLabel("task draft");
  await draft.fill("manual state");
  await page.evaluate(() => {
    window.originalDraft = document.querySelector('input[aria-label="task draft"]');
  });
  for (let index = 0; index < 60; index++) {
    await page.evaluate(() => window.connectionTest.refresh());
    await row.hover();
    await page.mouse.move(400, 700);
  }
  assert.deepEqual(errors, []);
  assert.equal(await draft.inputValue(), "manual state");
  assert.equal(
    await page.evaluate(
      () => window.originalDraft === document.querySelector('input[aria-label="task draft"]'),
    ),
    true,
  );
  await row.click();
  await draft.waitFor({ state: "hidden" });
  await row.click();
  await draft.waitFor();
  await page.evaluate(() => window.connectionTest.connect("disconnected"));
  await row.hover();
  await page.getByRole("button", { name: "workspaceSidebar.reconnect", exact: true }).click();
  await page.getByRole("status", { name: "workspaceSidebar.connecting" }).waitFor();
  assert.equal(await page.locator(".workspace-remote-connecting-breathe").count(), 1);
  for (let index = 0; index < 20; index++)
    await page.evaluate(() => window.connectionTest.refresh());
  await page.evaluate(() => window.connectionTest.connect("connected"));
  await draft.waitFor();
  assert.equal(await page.locator(".workspace-remote-connecting-breathe").count(), 0);
  assert.deepEqual(errors, []);
  console.log(
    "PASS workspace connection feedback: refresh, hover, collapse, reconnect, stable DOM",
  );
} finally {
  await browser?.close();
  await server.close();
}
