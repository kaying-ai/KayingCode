import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { test } from "vitest";
import { fileURLToPath } from "node:url";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

async function readWorkspaceFile(path: string): Promise<string> {
  return readFile(resolve(workspaceRoot, path), "utf8");
}

test("Desktop splash and React startup loading keep the same KY mark width", async () => {
  const [desktopHtml, startupLoading] = await Promise.all([
    readWorkspaceFile("packages/desktop/src/renderer/index.html"),
    readWorkspaceFile("packages/ui/src/root/RootStartupLoading.tsx"),
  ]);

  assert.match(desktopHtml, /\.startup-logo\s*\{[^}]*width:\s*73px;/su);
  assert.match(startupLoading, /KayingCodeStartupLogo className="h-auto w-\[73px\]"/u);
});

test("Desktop and React startup keep breathing until ready and honor reduced motion", async () => {
  const [desktopHtml, startupLoading, styles] = await Promise.all([
    readWorkspaceFile("packages/desktop/src/renderer/index.html"),
    readWorkspaceFile("packages/ui/src/root/RootStartupLoading.tsx"),
    readWorkspaceFile("packages/ui/src/styles.css"),
  ]);

  assert.match(desktopHtml, /@keyframes startup-logo-breathe/u);
  assert.match(desktopHtml, /animation:\s*startup-logo-breathe[^;]*infinite/u);
  assert.match(
    desktopHtml,
    /prefers-reduced-motion: reduce[\s\S]*\.startup-logo\s*\{[^}]*animation:\s*none/u,
  );
  assert.match(startupLoading, /animated \? "startup-logo-breathe" : undefined/u);
  assert.match(styles, /@keyframes startup-logo-breathe/u);
  assert.match(
    styles,
    /prefers-reduced-motion: reduce[\s\S]*\.startup-logo-breathe\s*\{[^}]*animation:\s*none/u,
  );
});

test("Windows executable and every runtime window use the KY application icon", async () => {
  const [builderConfig, windowChrome] = await Promise.all([
    readWorkspaceFile("packages/desktop/electron-builder.config.js"),
    readWorkspaceFile("packages/desktop/src/main/desktopWindowChrome.ts"),
  ]);

  assert.match(builderConfig, /win:\s*\{[^}]*icon:\s*"build\/icon\.ico"/su);
  assert.match(windowChrome, /app\.on\("browser-window-created"/u);
  assert.match(windowChrome, /win\.setIcon\(image\)/u);
});

test("the disconnected sidebar shows the game development harness tagline", async () => {
  const locale = await readWorkspaceFile("packages/ui/src/i18n/locales/zh-CN.ts");

  assert.match(locale, /"sidebar\.profile\.notLoggedIn":\s*"游戏开发Harness"/u);
});

test("the disconnected sidebar smoothly rolls the extensible branding copy upward", async () => {
  const [zhLocale, enLocale, footer, carousel, styles] = await Promise.all([
    readWorkspaceFile("packages/ui/src/i18n/locales/zh-CN.ts"),
    readWorkspaceFile("packages/ui/src/i18n/locales/en-US.ts"),
    readWorkspaceFile("packages/ui/src/WorkspaceSidebarFooter.tsx"),
    readWorkspaceFile("packages/ui/src/WorkspaceSidebar/SidebarBrandingCarousel.tsx"),
    readWorkspaceFile("packages/ui/src/styles.css"),
  ]);

  const expected = [
    ["harness", "游戏开发Harness", "Game Development Harness"],
    ["kayingcode", "KayingCode", "KayingCode"],
    ["kayingai", "kayingai.com", "kayingai.com"],
  ] as const;
  for (const [name, zh, en] of expected) {
    assert.match(zhLocale, new RegExp(`"sidebar\\.branding\\.${name}":\\s*"${zh}"`, "u"));
    assert.match(enLocale, new RegExp(`"sidebar\\.branding\\.${name}":\\s*"${en}"`, "u"));
  }

  // 未登录时展示轮播；触发按钮 aria-label 仍用稳定的 notLoggedIn 文案，不随轮播闪变。
  assert.match(footer, /user \? profileBadge : <SidebarBrandingCarousel \/>/u);
  assert.match(footer, /aria-label=\{profileBadge\}/u);

  // 轮播列表唯一定义在组件内；追加条目即可扩展，这里锁定当前顺序。
  const listedKeys = [...carousel.matchAll(/"sidebar\.branding\.([a-z]+)"/gu)].map(
    (match) => match[1],
  );
  assert.deepEqual(listedKeys, ["harness", "kayingcode", "kayingai"]);

  // 复用共享滚动标签，让旧文案向上离场与新文案从下方入场同时发生；
  // 不再用只覆盖入场的 keyframe 瞬间卸载旧文案。
  assert.match(carousel, /import \{ RollingToolbarLabel \}/u);
  assert.match(carousel, /<RollingToolbarLabel[\s\S]*label=\{message\}/u);
  assert.doesNotMatch(carousel, /kayingcode-branding-rotate-in/u);
  assert.doesNotMatch(styles, /kayingcode-branding-rotate-in/u);
});
