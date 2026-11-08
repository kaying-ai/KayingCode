import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { chromium } from "playwright-core";
import tailwindcss from "@tailwindcss/vite";
import { createServer } from "vite";

async function dragWithPointer(page, source, target) {
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  assert.ok(sourceBox && targetBox, "drag source and target must be visible");
  const sourcePoint = {
    x: sourceBox.x + sourceBox.width / 2,
    y: sourceBox.y + sourceBox.height / 2,
  };
  const targetPoint = {
    x: targetBox.x + targetBox.width / 2,
    y: targetBox.y + targetBox.height / 2,
  };
  await page.mouse.move(sourcePoint.x, sourcePoint.y);
  await page.mouse.down();
  await page.mouse.move(sourcePoint.x + 12, sourcePoint.y, { steps: 4 });
  await page.mouse.move(targetPoint.x, targetPoint.y, { steps: 12 });
  await page.mouse.up();
}

const server = await createServer({
  configFile: false,
  root: resolve(import.meta.dirname, "fixtures/project-pinning"),
  plugins: [tailwindcss()],
  resolve: { alias: { "@": resolve(import.meta.dirname, "../src") } },
  esbuild: { jsx: "automatic" },
  optimizeDeps: { include: ["react", "react-dom/client", "react/jsx-runtime"] },
  server: { host: "127.0.0.1", port: 0, fs: { allow: [resolve(import.meta.dirname, "../../..")] } },
});
let browser;
try {
  await server.listen();
  browser = await chromium.launch({
    channel:
      process.env.KAYINGCODE_E2E_BROWSER_CHANNEL ??
      (process.platform === "win32" ? "msedge" : "chrome"),
    headless: true,
  });
  const page = await browser.newPage({ viewport: { width: 420, height: 760 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(server.resolvedUrls.local[0]);

  const pinned = page.getByTestId("pinned-project-section");
  const projects = page.getByTestId("project-section");
  const tasks = page.getByTestId("task-section");
  await tasks.locator('[data-slot="collapsible"]').waitFor();
  await page.waitForFunction(
    () =>
      document
        .querySelector('[data-testid="task-section"] [data-slot="collapsible"]')
        ?.getAttribute("data-state") === "closed",
  );
  assert.equal(await projects.getByText("alpha-game").count(), 1);
  assert.equal(await pinned.getByText("alpha-game").count(), 0);

  await dragWithPointer(
    page,
    page.getByTestId("project-drag-one"),
    page.getByTestId("pinned-project-drop-area"),
  );
  assert.equal(await pinned.getByText("alpha-game").count(), 1);
  assert.equal(await projects.getByText("alpha-game").count(), 0);

  await dragWithPointer(
    page,
    page.getByTestId("project-drag-one"),
    projects.locator('[data-slot="collapsible-trigger"]'),
  );
  assert.equal(await pinned.getByText("alpha-game").count(), 0);
  assert.equal(await projects.getByText("alpha-game").count(), 1);

  await projects.getByRole("button", { name: "置顶项目" }).first().click();
  assert.equal(await pinned.getByText("alpha-game").count(), 1);

  await page.reload();
  assert.equal(await page.getByTestId("pinned-project-section").getByText("alpha-game").count(), 1);
  await page.getByTestId("task-section").hover();
  await page.getByRole("button", { name: "新建任务" }).click();
  await page.getByText("第一个任务").waitFor();
  await page.screenshot({
    path: resolve(tmpdir(), "zcode-project-pinning-sidebar.png"),
    animations: "disabled",
  });
  assert.deepEqual(errors, []);
  console.log(
    "PASS project pinning sidebar E2E: drag between sections, menu persistence, empty task collapse",
  );
} finally {
  await browser?.close();
  await server.close();
}
