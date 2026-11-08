import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "vitest";
import zhCN from "../src/i18n/locales/zh-CN.js";
import enUS from "../src/i18n/locales/en-US.js";

test("sidebar hides its search row while the command center remains available in App", async () => {
  const [sidebar, app] = await Promise.all([
    readFile(new URL("../src/WorkspaceSidebar.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/App.tsx", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(sidebar, /id:\s*"commandCenter.open"/u);
  assert.match(app, /<CommandCenterDialog/u);
});

test("scheduled task menu, page, tab and breadcrumb share the same naming", () => {
  for (const key of [
    "workspace.openScheduledSettings",
    "settings.automations.title",
    "automations.pageTab.automation",
  ] as const) {
    assert.equal(zhCN[key], "定时任务");
    assert.equal(enUS[key], "Scheduled tasks");
  }
  assert.equal(zhCN["automations.breadcrumbLabel"], "定时任务路径");
  assert.equal(zhCN["automations.pageTab.ariaLabel"], "定时任务页面");
});

test("sidebar game center entry uses the My game center naming", () => {
  assert.equal(zhCN["gameFeatures.sidebarCenter"], "我的游戏中心");
  assert.equal(enUS["gameFeatures.sidebarCenter"], "My game center");
});

test("game center back action keeps its copy while gaining visual emphasis", async () => {
  const [navigation, mainView] = await Promise.all([
    readFile(new URL("../src/game-features/GameFeatureNavigation.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/game-features/GameFeatureMainView.tsx", import.meta.url), "utf8"),
  ]);

  // 侧栏入口使用“我的游戏中心”专属文案；内容区页头标题仍为 gameFeatures.center。
  assert.match(navigation, /id:\s*"gameFeatures\.sidebarCenter"/u);
  // 返回对话保持可访问名称（E2E 按角色定位），同时以次级填充、边框和悬停箭头位移加强。
  assert.match(mainView, /variant="secondary"/u);
  assert.match(mainView, /group-hover\/button:-translate-x-0\.5/u);
  assert.match(mainView, /border border-border font-medium/u);
  assert.match(mainView, /\{t\("back"\)\}/u);
});
