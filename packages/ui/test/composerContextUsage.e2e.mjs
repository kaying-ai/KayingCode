import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { chromium } from "playwright-core";
import tailwindcss from "@tailwindcss/vite";
import { createServer } from "vite";

const server = await createServer({
  configFile: false,
  root: resolve(import.meta.dirname, "fixtures/composer-context-usage"),
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
  const page = await browser.newPage({ viewport: { width: 1200, height: 700 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(server.resolvedUrls.local[0]);

  for (const width of [640, 1100]) {
    const row = page.getByTestId(`composer-row-${width}`);
    const trigger = row.getByTestId("chat-context-usage-trigger");
    await trigger.waitFor();

    // 触发器是环形图标：命中百分比靠进度弧，不再占工具栏文字宽度。
    assert.equal(await trigger.locator("svg").count(), 1, "用量触发器应渲染环形图标");
    assert.equal((await trigger.textContent())?.trim() ?? "", "", "用量触发器不应有文本");

    // provider 前缀必须常显：640px 容器小于 @2xl/composer 断点，恢复前会被断点隐藏。
    const prefix = row.locator(".composer-provider-prefix");
    await prefix.waitFor();
    assert.equal(await prefix.isVisible(), true, `宽度 ${width} 下 provider 前缀应可见`);
    assert.equal((await prefix.textContent())?.trim(), "OpenCode Go (Chat)/");
    const modelTrigger = row.getByTestId("chat-model-select-trigger");
    assert.equal(
      (await modelTrigger.textContent())?.replaceAll(/\s+/gu, ""),
      "OpenCode Go (Chat)/deepseek-v4.1-flash".replaceAll(/\s+/gu, ""),
    );
    // provider + 模型名必须完整可见：截断成 “deepseek...” 等于没显示模型信息。
    const modelNameOverflow = await modelTrigger.evaluate((trigger) => {
      const target = [...trigger.querySelectorAll("span")].find(
        (span) => span.textContent?.trim() === "deepseek-v4.1-flash",
      );
      return target ? target.scrollWidth - target.clientWidth : Number.NaN;
    });
    assert.ok(modelNameOverflow <= 1, `模型名被截断：溢出 ${modelNameOverflow}px`);
  }

  const narrowRow = page.getByTestId("composer-row-640");
  await narrowRow.getByTestId("chat-context-usage-trigger").hover();
  const panel = page.locator('[data-slot="hover-card-content"]');
  await panel.getByText("上下文容量").waitFor();
  assert.equal(await panel.getByText("478K/1M (47.8%)", { exact: true }).count(), 1);
  assert.equal(await panel.getByText("87.5%", { exact: true }).count(), 1);
  assert.equal(await panel.getByText("平均缓存命中率", { exact: true }).count(), 1);
  assert.equal(await panel.getByText("99.2%", { exact: true }).count(), 1);
  for (const label of ["消息", "系统工具", "MCP 工具", "技能", "系统提示词", "其他"]) {
    assert.equal(
      await panel.getByText(label, { exact: true }).count(),
      1,
      `面板缺少 ${label} 明细行`,
    );
  }
  // 悬浮提示同样给出用量数字：环形图标本身不占工具栏文字宽度。
  assert.ok((await page.getByText("478K/1M (47.8%)").count()) >= 1);

  await page.screenshot({
    path: resolve(tmpdir(), "zcode-composer-context-usage.png"),
    animations: "disabled",
  });
  assert.deepEqual(errors, []);
  console.log(
    "composer context usage e2e ok",
    resolve(tmpdir(), "zcode-composer-context-usage.png"),
  );
} finally {
  await browser?.close();
  await server.close();
}
