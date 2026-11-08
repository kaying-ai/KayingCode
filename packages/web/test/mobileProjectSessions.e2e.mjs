import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright-core";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { stageUpstreamWeb } from "../scripts/stage-upstream-web.mjs";

const webRoot = resolve(import.meta.dirname, "..");
const repoRoot = resolve(webRoot, "../..");
const { stage } = await stageUpstreamWeb({ repoRoot, webRoot });
const ui = resolve(stage, "packages/ui/src").replaceAll("\\", "/");
const stagedWeb = resolve(stage, "packages/web/src").replaceAll("\\", "/");
const fixture = resolve(repoRoot, ".tmp/mobile-project-sessions-e2e");
await mkdir(fixture, { recursive: true });
await writeFile(
  resolve(fixture, "index.html"),
  `<meta name="viewport" content="width=device-width, initial-scale=1">
  <script>
    document.documentElement.className = matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark theme-zai-dark"
      : "theme-zai-light";
  </script>
  <div id="root"></div><script type="module" src="/fixture.jsx"></script>`,
);
await writeFile(resolve(fixture, "style.css"), `@import "${ui}/styles.css";`);
// 挂载实际 staging 侧栏和目录 Provider，只在 Host 服务与导航出口注入测试数据。
await writeFile(
  resolve(fixture, "fixture.jsx"),
  `
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';
import { ProjectDirectoryProvider, ProjectSidebar } from '@/project-sidebar/index.js';
import { ZCodeIntlProvider } from '@/i18n/IntlProvider.js';
import { TabStoreProvider } from '@/store/TabStoreProvider.js';
import { StoreProvider } from '@/store/StoreProvider.js';
import { ServiceProvider } from '@/hooks/useServices.js';
import { PlatformProvider } from '@/hooks/usePlatform.js';
import { CodingPlanUpgradeDialogProvider } from '@/settings/CodingPlanUpgradeDialogProvider.js';
import { WebRemoteControlMobileShell } from '@/WebRemoteControlMobileShell.js';
import { isFlutterMobileShell, readMobileShellProjectKey } from '/@fs/${stagedWeb}/mobileWebview.ts';

const roots = (paths) => paths.map((rootPath, position) => ({ rootPath, position, isPrimary: !position }));
const project = (id, name, ...paths) => ({
  id, name, hostId: 'local', roots: roots(paths), position: 0,
  pinned: false, deleted: false, nameOverridden: false, createdAt: 0, updatedAt: 0,
});
const task = (taskId, title, projectId, workspacePath, flags) => ({
  taskId, title, traceId: taskId, projectId, workspacePath, hostId: 'local',
  createdAt: 0, updatedAt: 0, mode: 'default', pinned: false, archived: false, ...flags,
});
const windowsPath = 'D:/game'.replaceAll('/', String.fromCharCode(92));
const tree = {
  projects: [
    project('game', '示例项目', 'D:/game', '/assets'),
    project('legacy', '旧路径项目', windowsPath),
    project('empty', '空项目', '/empty'),
    project('other', '其他项目', '/other'),
    project('ambiguous-a', '冲突项目 A', '/ambiguous'),
    project('ambiguous-b', '冲突项目 B', '/ambiguous'),
  ],
  tasks: [
    task('design', '关卡设计', 'game', 'D:/game', {
      pinned: true, unreadAt: 1, updatedAt: Date.now() - 120_000,
    }),
    task('assets', '资源整理', 'game', '/assets', {
      archived: true, updatedAt: Date.now() - 2_400_000,
    }),
    task('legacy', '旧路径会话', 'legacy', windowsPath),
    task('other', '其他项目会话', 'other', '/other'),
  ],
};
const subscribe = () => ({ dispose() {} });
const broadcastService = { onMessage: subscribe, send() {} };
const platform = { syncWindowUnreadCount() {} };
const projectWorkspaceKey = readMobileShellProjectKey(location.search);
const services = {
  broadcastService,
  projectService: {
    async readTree() {
      if (projectWorkspaceKey === '/unavailable') throw new Error('项目目录读取失败');
      return tree;
    },
  },
  zcodeTaskService: { onDynamicWorkspaceEvent: () => subscribe },
};
function Workbench() {
  const [workspacePath, setWorkspacePath] = useState(projectWorkspaceKey);
  const [intent, setIntent] = useState();
  const switcher = {
    projectWorkspaceKey,
    flutterNavigation: isFlutterMobileShell(location.search),
    async switchWorkspace(key, options) {
      window.openedTask = { key, ...options };
      setWorkspacePath(key);
      setIntent(options.mobileNavigationIntent);
    },
    async startDraft(key, options) { window.startedDraft = { key, ...options }; },
  };
  return (
    <main className="h-dvh bg-background text-foreground">
      <WebRemoteControlMobileShell switcher={switcher} activeWorkspacePath={workspacePath}
        activeTaskId={null} initialNavigationIntent={intent} chatContent="会话详情"
        renderChatHeader={() => null}
        renderTaskHome={({ navigateToChat }) => (
          <ProjectSidebar isWebRemoteControl workspacePath={workspacePath}
            webRemoteControlWorkspaceSwitcher={switcher}
            onCreateTask={(request) => { window.startedDraft = request; navigateToChat(); }}
            onSelectTask={(path, taskId) => { window.openedTask = { path, taskId }; }}
            onWebRemoteTaskOpen={({ crossWorkspace }) => { if (!crossWorkspace) navigateToChat(); }} />
        )} />
    </main>
  );
}
const root = createRoot(document.getElementById('root'));
window.closeWorkbench = () => root.unmount();
root.render(
  <ZCodeIntlProvider initialLocale="zh-CN">
    <StoreProvider broadcastService={broadcastService}>
      <ServiceProvider services={services}>
        <PlatformProvider platform={platform}>
          <TabStoreProvider>
            <CodingPlanUpgradeDialogProvider>
              <ProjectDirectoryProvider>
                <Workbench />
              </ProjectDirectoryProvider>
            </CodingPlanUpgradeDialogProvider>
          </TabStoreProvider>
        </PlatformProvider>
      </ServiceProvider>
    </StoreProvider>
  </ZCodeIntlProvider>
);
`,
);

const server = await createServer({
  configFile: false,
  root: fixture,
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": ui } },
  optimizeDeps: { include: ["react", "react-dom/client", "react/jsx-runtime"] },
  server: { host: "127.0.0.1", port: 0, fs: { allow: [repoRoot] } },
});
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: "zh-CN" });
  await page.addInitScript(() => {
    window.KayingNavigation = {
      postMessage(message) {
        window.flutterPage = JSON.parse(message);
      },
    };
  });
  page.setDefaultTimeout(60_000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const base = server.resolvedUrls.local[0];
  const enter = (key, platform = "flutter") =>
    page.goto(
      `${base}?kayingShell=1&kayingPlatform=${platform}&kayingWorkspace=${encodeURIComponent(key)}`,
      {
        waitUntil: "commit",
      },
    );
  const list = page.getByTestId("mobile-project-sessions");
  const create = list.getByRole("button", { name: "新建任务" });
  const expectFlutterPage = (view) =>
    page.waitForFunction(
      (expected) =>
        window.flutterPage?.type === "kayingcode.mobile-page.v1" &&
        window.flutterPage.page === expected,
      view,
    );

  for (const [width, theme] of [
    [320, "light"],
    [390, "dark"],
  ]) {
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ colorScheme: theme });
    await enter("D:/game");
    await list.getByRole("heading", { name: "示例项目" }).waitFor();
    await list.getByText("2 个任务", { exact: true }).waitFor();
    const task = list.locator("[data-task-item-key]").filter({ hasText: "关卡设计" });
    await task
      .locator("[data-task-workspace-label]")
      .filter({ hasText: /^game$/ })
      .waitFor();
    await task
      .locator("[data-task-row-metadata]")
      .getByText(/^\d+分$/)
      .waitFor();
    assert.ok((await task.boundingBox()).height >= 60);
    assert.equal(await list.getByText("其他项目会话", { exact: true }).count(), 0);
    assert.equal(await list.getByText("旧路径会话", { exact: true }).count(), 0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
    await page.screenshot({ path: resolve(fixture, `tasks-${width}-${theme}.png`) });
  }
  await expectFlutterPage("browse");
  await list.getByText("资源整理", { exact: true }).click();
  await page.getByText("会话详情", { exact: true }).waitFor();
  await expectFlutterPage("agent");
  assert.deepEqual(await page.evaluate(() => window.openedTask), {
    key: "/assets",
    taskId: "assets",
    taskHostId: "local",
    mobileNavigationIntent: "chat",
  });
  await page.getByRole("button", { name: "返回任务首页" }).click();
  await list.getByRole("heading", { name: "示例项目" }).waitFor();
  await list.getByText("关卡设计", { exact: true }).waitFor();
  await expectFlutterPage("browse");

  await enter("D:\\game");
  await list.getByRole("heading", { name: "旧路径项目" }).waitFor();
  await list.getByText("旧路径会话", { exact: true }).waitFor();
  assert.equal(await list.getByText("关卡设计", { exact: true }).count(), 0);
  await create.click();
  assert.deepEqual(await page.evaluate(() => window.startedDraft), {
    projectId: "legacy",
    hostId: "local",
  });
  await expectFlutterPage("agent");
  await page.reload({ waitUntil: "commit" });
  await expectFlutterPage("agent");
  await page.evaluate(() => window.closeWorkbench());
  await expectFlutterPage("browse");

  await enter("/ambiguous");
  await list.getByText("此工作区对应多个项目，请在桌面端确认项目归属。").waitFor();
  assert.equal(await create.count(), 0);

  await enter("/empty");
  await list.getByTestId("project-no-tasks").waitFor();
  await create.click();
  assert.deepEqual(await page.evaluate(() => window.startedDraft), {
    projectId: "empty",
    hostId: "local",
  });
  await enter("/standalone");
  await list.getByTestId("project-no-tasks").waitFor();
  await create.click();
  assert.deepEqual(await page.evaluate(() => window.startedDraft), {
    key: "/standalone",
    mobileNavigationIntent: "chat",
  });
  await enter("/unavailable", "weapp");
  await list.getByText("Error: 项目目录读取失败", { exact: true }).waitFor();
  assert.equal(await create.count(), 0);
  assert.equal(await list.getByTestId("project-no-tasks").count(), 0);
  assert.equal(await page.evaluate(() => window.flutterPage), undefined);
  assert.deepEqual(errors, []);
  console.log(
    "Mobile project sessions: scoped rows, cross-root opening and empty project drafts passed",
  );
} finally {
  await browser?.close();
  await server.close();
}
