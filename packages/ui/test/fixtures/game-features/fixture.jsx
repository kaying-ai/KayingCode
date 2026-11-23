import React, { useState } from "react";
import { TooltipProvider } from "../../../src/components/ui/tooltip.js";
import { createRoot } from "react-dom/client";
import { GameFeatureNavigation } from "../../../src/game-features/GameFeatureNavigation.js";
import { GameFeatureMainView } from "../../../src/game-features/GameFeatureMainView.js";
import { isGameFeaturePage } from "../../../src/lib/gameFeaturePages.js";
import { SidebarBrandingCarousel } from "../../../src/WorkspaceSidebar/SidebarBrandingCarousel.js";
import { KayingCodeIntlProvider, useKayingCodeIntl } from "../../../src/i18n/IntlProvider.js";
import { PlatformProvider } from "../../../src/hooks/usePlatform.js";
import { ServiceProvider } from "../../../src/hooks/useServices.js";
import { TabStoreProvider, useTabStoreApi } from "../../../src/store/TabStoreProvider.js";
import "./styles.css";

const project = {
  id: "game-id",
  name: "测试游戏",
  localDirectory: null,
  createdAt: null,
  lastAccessedAt: null,
  lastConversationAt: null,
  gameType: "3D",
  stage: "draft",
  pinnedAt: null,
};
window.fixture = {
  projects: [project],
  calls: [],
  opened: [],
  openedProjectIds: [],
  projectSaves: [],
  folders: [],
  directory: null,
  fail: false,
  defer: false,
  isDesktop: true,
  external: [],
  finishedRestores: 0,
};
// 项目库是侧栏项目行的唯一事实源；恢复与候选目录都要经过它。
const localProjects = [
  {
    id: "manual-project",
    deleted: false,
    roots: [{ rootPath: "C:/games/manual-project", isPrimary: true }],
  },
];
const projectService = {
  readProjects: async () => localProjects,
  saveProject: async (input) => {
    window.fixture.projectSaves.push(input);
    const rootPath = input.roots?.[0] ?? "restored";
    return {
      id: `project:${rootPath}`,
      name: input.name ?? "restored",
      deleted: false,
      roots: (input.roots ?? []).map((root, index) => ({
        rootPath: root,
        isPrimary: index === 0,
      })),
    };
  },
};
const platform = {
  selectDirectory: async () => window.fixture.directory,
  openExternal: (url) => window.fixture.external.push(url),
  openInFileManager: async (path) => {
    window.fixture.folders.push(path);
    return { success: true };
  },
};
const service = {
  manageTapMakerProjects: async (input) => {
    const fixture = window.fixture;
    fixture.calls.push(input);
    if (fixture.defer)
      await new Promise((resolve) => {
        fixture.complete = resolve;
      });
    if (fixture.fail) throw new Error("fixture failure");
    if (input.action === "list") return { action: "list", projects: fixture.projects };
    if (input.action === "restore") {
      fixture.finishedRestores++;
      return { action: "restore", projectRoot: "C:/games/restored-child" };
    }
    return { action: "authorize" };
  },
};
function Fixture() {
  const [view, setView] = useState("chat");
  window.fixture.tabs = useTabStoreApi();
  const { setLocale } = useKayingCodeIntl();
  window.fixture.setLocale = setLocale;
  return (
    <div className="flex h-screen min-w-0 flex-col bg-background text-foreground sm:flex-row">
      <aside className="flex shrink-0 gap-1 overflow-x-auto p-2 sm:w-64 sm:flex-col">
        <button data-testid="plugin-store-sidebar-open" onClick={() => setView("plugin-store")}>
          插件市场
        </button>
        <GameFeatureNavigation page={isGameFeaturePage(view) ? view : null} onNavigate={setView} />
        <div className="min-w-0 overflow-hidden" data-testid="branding-carousel-fixture">
          <SidebarBrandingCarousel />
        </div>
      </aside>
      <section className="min-h-0 min-w-0 flex-1">
        <div hidden={view !== "chat"}>
          <input id="draft" aria-label="Draft" defaultValue="保留原草稿" />
          <div id="preview">当前预览</div>
        </div>
        {view === "plugin-store" ? <div data-testid="plugin-content">插件内容</div> : null}
        {isGameFeaturePage(view) ? (
          <GameFeatureMainView
            page={view}
            isDesktop={window.fixture.isDesktop}
            supportsEmbeddedBrowser={new URLSearchParams(location.search).has("embedded")}
            onNavigate={setView}
            onOpenProject={({ path, projectId }) => {
              window.fixture.opened.push(path);
              if (projectId) window.fixture.openedProjectIds.push(projectId);
              setView("chat");
            }}
            onBack={() => setView("chat")}
          />
        ) : null}
      </section>
    </div>
  );
}
createRoot(document.getElementById("root")).render(
  <TooltipProvider>
    <KayingCodeIntlProvider initialLocale="zh-CN">
      <PlatformProvider platform={platform}>
        <ServiceProvider services={{ kayingcodeAgentService: service, projectService }}>
          <TabStoreProvider>
            <Fixture />
          </TabStoreProvider>
        </ServiceProvider>
      </PlatformProvider>
    </KayingCodeIntlProvider>
  </TooltipProvider>,
);
