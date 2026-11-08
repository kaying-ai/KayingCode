import assert from "node:assert/strict";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { createServer } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { chromium } from "playwright-core";

const server = await createServer({
  configFile: false,
  root: resolve(import.meta.dirname, "fixtures/game-features"),
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
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(server.resolvedUrls.local[0]);
  await page.evaluate(() => document.documentElement.classList.add("theme-zai-light"));
  const brandingTransition = await page.getByTestId("branding-carousel-fixture").evaluate(
    (node) =>
      new Promise((resolve) => {
        const timeout = window.setTimeout(() => {
          observer.disconnect();
          resolve({ labels: [], offsets: [] });
        }, 2 * 4000);
        const observer = new MutationObserver(() => {
          if (node.firstElementChild?.children.length !== 2) return;
          window.setTimeout(() => {
            const labels = [...node.firstElementChild.children].map((child) => child.textContent);
            const offsets = [...node.firstElementChild.children].map(
              (child) => new DOMMatrix(getComputedStyle(child).transform).m42,
            );
            window.clearTimeout(timeout);
            observer.disconnect();
            resolve({ labels, offsets });
          }, 80);
        });
        observer.observe(node, { childList: true, subtree: true });
      }),
  );
  assert.deepEqual(brandingTransition.labels, ["游戏开发Harness", "KayingCode"]);
  assert.ok(Math.min(...brandingTransition.offsets) < 0);
  assert.ok(Math.max(...brandingTransition.offsets) > 0);
  const content = page.getByTestId("game-feature-main");
  const waitClosed = () => content.waitFor({ state: "hidden" });
  const openCenter = async () => {
    await page.getByTestId("game-center-sidebar-open").click();
    await content.waitFor();
  };
  const open = async (id) => {
    await openCenter();
    if (id !== "tapmaker-projects") {
      await content.getByTestId(`game-center-tab-${id}`).click();
    }
    assert.equal(await page.getByRole("dialog").count(), 0);
    assert.equal(await page.locator("[data-slot=dialog-overlay]").count(), 0);
  };
  const screenshot = async (name) => {
    await content.evaluate((el) =>
      Promise.all(el.getAnimations().map((animation) => animation.finished)),
    );
    const theme = await content.evaluate((el) => {
      const style = getComputedStyle(el);
      return { background: style.backgroundColor, opacity: style.opacity };
    });
    assert.equal(theme.opacity, "1");
    assert.equal(
      theme.background,
      name.includes("light") ? "rgb(248, 248, 248)" : "rgb(22, 22, 22)",
    );
    await page.screenshot({ path: resolve(tmpdir(), name), animations: "disabled" });
  };
  assert.equal(
    await page
      .getByTestId("plugin-store-sidebar-open")
      .evaluate(
        (plugin, gameCenter) =>
          Boolean(plugin.compareDocumentPosition(gameCenter) & Node.DOCUMENT_POSITION_FOLLOWING),
        await page.getByTestId("game-center-sidebar-open").elementHandle(),
      ),
    true,
  );
  assert.equal(await page.locator('[data-testid^="game-feature-"]').count(), 0);
  await openCenter();
  const navigation = content.getByTestId("game-center-navigation");
  assert.ok((await navigation.boundingBox()).height <= 72);
  assert.equal(
    await content.getByRole("button", { name: "返回对话" }).getAttribute("data-variant"),
    "secondary",
  );
  assert.equal(
    await content.getByTestId("game-center-tab-tapmaker-projects").getAttribute("aria-selected"),
    "true",
  );
  assert.deepEqual(await content.getByRole("tab").allTextContents(), [
    "我的游戏",
    "游戏排行",
    "免费 Token",
  ]);
  const navigationTop = (await navigation.boundingBox()).y;
  const tabsTop = (await content.getByRole("tablist").boundingBox()).y;
  assert.ok(Math.abs(navigationTop - tabsTop) <= 20);
  await content.getByTestId("game-center-tab-tapmaker-projects").focus();
  await page.keyboard.press("ArrowRight");
  assert.equal(
    await content.getByTestId("game-center-tab-game-ranking").getAttribute("aria-selected"),
    "true",
  );
  await page.keyboard.press("Home");
  assert.equal(
    await content.getByTestId("game-center-tab-tapmaker-projects").getAttribute("aria-selected"),
    "true",
  );
  await content.getByTestId("game-center-tab-free-token").click();
  await content.getByRole("button", { name: "在浏览器中打开" }).click();
  assert.equal(
    await page.evaluate(() => window.fixture.external.at(-1)),
    "https://www.kayingai.com/freellm",
  );
  await content.getByTestId("game-center-tab-game-ranking").click();
  await content.getByRole("button", { name: "在浏览器中打开" }).click();
  assert.equal(
    await page.evaluate(() => window.fixture.external.at(-1)),
    "https://www.taptap.cn/top/download",
  );
  await content.getByRole("button", { name: "返回对话" }).click();
  await waitClosed();
  assert.equal(await page.locator("#draft").inputValue(), "保留原草稿");
  await open("free-token");
  await page.getByTestId("plugin-store-sidebar-open").click();
  await waitClosed();
  assert.equal(await page.getByTestId("plugin-content").isVisible(), true);
  await open("tapmaker-projects");
  await page.getByTestId("tapmaker-project-card").waitFor();
  await screenshot("zcode-tapmaker-list-light.png");
  await page.evaluate(() => {
    document.documentElement.classList.remove("theme-zai-light");
    document.documentElement.classList.add("dark", "theme-zai-dark");
  });
  await screenshot("zcode-tapmaker-list-dark.png");
  await content.getByRole("button", { name: "恢复到本地", exact: true }).click();
  assert.equal(
    await page.evaluate(
      () => window.fixture.calls.filter((call) => call.action === "restore").length,
    ),
    0,
  );
  await page.evaluate(() => {
    window.fixture.directory = "C:/games";
    window.fixture.defer = true;
  });
  await content.getByRole("button", { name: "恢复到本地", exact: true }).click();
  await page.waitForFunction(() => !!window.fixture.complete);
  await page.keyboard.press("Escape");
  assert.equal(await content.isVisible(), true);
  assert.equal(await page.getByTestId("game-center-sidebar-open").isEnabled(), true);
  await page.evaluate(() => {
    window.fixture.defer = false;
    window.fixture.complete();
  });
  await waitClosed();
  assert.deepEqual(await page.evaluate(() => window.fixture.opened), ["C:/games/restored-child"]);
  assert.equal(
    await page.evaluate(() => window.fixture.tabs.getState().tabs[0].workspacePath),
    "C:/games/restored-child",
  );
  await page.evaluate(() => {
    window.fixture.projects = [];
  });
  await open("tapmaker-projects");
  await content.getByText("暂无远端游戏", { exact: true }).waitFor();
  await page.evaluate(() => {
    window.fixture.fail = true;
  });
  await content.getByRole("button", { name: "刷新", exact: true }).click();
  await content.getByRole("alert").waitFor();
  await page.evaluate(() => {
    window.fixture.fail = false;
  });
  await content.getByRole("button", { name: "TapTap 登录授权" }).click();
  await content.getByText("暂无远端游戏", { exact: true }).waitFor();
  assert.equal(
    await page.evaluate(() => window.fixture.calls.some((call) => call.action === "authorize")),
    true,
  );
  await page.evaluate(() => {
    window.fixture.projects = [
      {
        id: "local-game",
        name: "Local game",
        localDirectory: "C:/local-game",
        createdAt: null,
        lastAccessedAt: null,
        lastConversationAt: null,
        gameType: null,
        stage: null,
        pinnedAt: null,
      },
    ];
  });
  await content.getByRole("button", { name: "刷新", exact: true }).click();
  await content.getByRole("button", { name: "打开本地项目", exact: true }).click();
  await waitClosed();
  assert.equal(await page.evaluate(() => window.fixture.opened.at(-1)), "C:/local-game");
  await open("tapmaker-projects");
  await page.evaluate(() => {
    window.fixture.projects[0].localDirectory = null;
  });
  await content.getByRole("button", { name: "刷新", exact: true }).click();
  await content.getByRole("button", { name: "恢复到本地", exact: true }).waitFor();
  await page.evaluate(() => {
    window.fixture.defer = true;
    window.fixture.complete = null;
  });
  await content.getByRole("button", { name: "恢复到本地", exact: true }).click();
  await page.waitForFunction(() => !!window.fixture.complete);
  const openedBefore = await page.evaluate(() => window.fixture.opened.length);
  await page.getByTestId("plugin-store-sidebar-open").click();
  await waitClosed();
  await page.evaluate(() => {
    window.fixture.defer = false;
    window.fixture.complete();
  });
  await page.waitForFunction(() => window.fixture.finishedRestores === 2);
  assert.equal(await page.getByTestId("plugin-content").isVisible(), true);
  assert.equal(await page.evaluate(() => window.fixture.opened.length), openedBefore);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    window.fixture.isDesktop = false;
    window.fixture.setLocale("en-US");
  });
  await open("game-ranking");
  await content.getByRole("heading", { name: "Daily game ranking", exact: true }).waitFor();
  await screenshot("zcode-tapmaker-mobile.png");
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    true,
  );
  await open("tapmaker-projects");
  assert.equal(
    await content.getByRole("button", { name: "Restore locally", exact: true }).isDisabled(),
    true,
  );
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    true,
  );
  await page.evaluate(() => {
    window.fixture.projects = Array.from({ length: 12 }, (_, index) => ({
      ...window.fixture.projects[0],
      id: `12345678-1234-1234-1234-${String(index).padStart(12, "0")}`,
      name:
        index === 0
          ? "名称很长的 TapMaker 游戏，用来验证卡片保持紧凑且完整名称可查看"
          : `Game ${index + 1}`,
      localDirectory:
        index === 0 ? "C:/games/a-very-long-directory-name/nested-path/project-folder" : null,
      gameType: "sce",
      stage: "plan",
      createdAt: "2026-09-30T10:00:00Z",
      pinnedAt: index === 0 ? "2026-09-30T10:00:00Z" : null,
    }));
  });
  await content.getByRole("button", { name: "Refresh", exact: true }).click();
  const cards = page.getByTestId("tapmaker-project-card");
  await page.waitForFunction(
    () => document.querySelectorAll('[data-testid="tapmaker-project-card"]').length === 12,
  );
  assert.equal(await cards.getByText(/12345678-1234-1234-1234-/).count(), 0);
  assert.equal(await cards.locator('[title^="12345678-1234-1234-1234-"]').count(), 0);
  assert.equal(
    await cards.first().locator("time").getAttribute("datetime"),
    "2026-09-30T10:00:00Z",
  );
  const mobileRects = await cards.evaluateAll((nodes) =>
    nodes.map((node) => {
      const r = node.getBoundingClientRect();
      return { x: r.x, width: r.width };
    }),
  );
  assert.equal(new Set(mobileRects.map((rect) => rect.x)).size, 1);
  assert.equal(mobileRects[0].x, 12);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.equal(
    await cards.first().getByRole("heading").getAttribute("title"),
    "名称很长的 TapMaker 游戏，用来验证卡片保持紧凑且完整名称可查看",
  );
  const localButton = cards.first().getByRole("button", { name: "Open local project" });
  assert.ok(await localButton.evaluate((button) => button.scrollWidth <= button.clientWidth));
  assert.equal(
    await cards
      .first()
      .getByText("C:/games/a-very-long-directory-name/nested-path/project-folder")
      .getAttribute("title"),
    "C:/games/a-very-long-directory-name/nested-path/project-folder",
  );
  await screenshot("zcode-tapmaker-cards-mobile.png");
  await page.setViewportSize({ width: 1536, height: 900 });
  await page.evaluate(() => {
    window.fixture.isDesktop = true;
    window.fixture.setLocale("zh-CN");
  });
  await content.getByRole("button", { name: "恢复到本地", exact: true }).first().waitFor();
  assert.ok(
    await content.getByRole("button", { name: "恢复到本地", exact: true }).first().isEnabled(),
  );
  const desktopRects = await cards.evaluateAll((nodes) =>
    nodes.map((node) => {
      const r = node.getBoundingClientRect();
      return {
        x: r.x,
        y: r.y,
        width: r.width,
        height: r.height,
        buttonY: node.querySelector("button").getBoundingClientRect().y,
      };
    }),
  );
  const firstRow = desktopRects.filter((rect) => rect.y === desktopRects[0].y);
  assert.equal(firstRow.length, 3);
  const pageBounds = await page.getByTestId("tapmaker-projects-page").evaluate((node) => {
    const left = node.getBoundingClientRect().left + node.clientLeft;
    return { left, right: left + node.clientWidth };
  });
  const leftGutter = firstRow[0].x - pageBounds.left;
  const rightGutter = pageBounds.right - firstRow[2].x - firstRow[2].width;
  assert.ok(leftGutter >= 48 && rightGutter >= 48);
  assert.ok(Math.abs(leftGutter - rightGutter) <= 1);
  assert.ok(firstRow.every((rect) => rect.width <= 320));
  assert.ok(Math.abs(firstRow[0].width - firstRow[2].width) <= 1);
  assert.equal(new Set(firstRow.map((rect) => rect.buttonY)).size, 1);
  assert.equal(desktopRects[3].y - desktopRects[0].y - desktopRects[0].height, 16);
  await screenshot("zcode-tapmaker-cards-dark.png");
  await page.setViewportSize({ width: 1080, height: 800 });
  assert.equal(
    await cards.evaluateAll(
      (nodes) => nodes.filter((node) => node.offsetTop === nodes[0].offsetTop).length,
    ),
    2,
  );
  await content.getByRole("button", { name: "返回对话" }).click();
  await waitClosed();
  assert.deepEqual(errors, []);
  console.log(
    "PASS game feature E2E: smooth branding roll, compact game navigation, main routing without dialogs, URLs, preserved draft, project actions, mobile and English",
  );
} finally {
  await browser?.close();
  await server.close();
}
