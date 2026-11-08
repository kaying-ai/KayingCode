import { readFile, writeFile, copyFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
const hash = (s) => createHash("sha256").update(s).digest("hex");
const sidebar = "packages/ui/src/project-sidebar";
export const MOBILE_PROJECT_ADAPTERS = {
  [`${sidebar}/mobileProjectTaskScope.ts`]: "packages/web/src/mobileProjectTaskScope.ts",
  [`${sidebar}/MobileProjectSessions.tsx`]: `${sidebar}/MobileProjectSessions.tsx`,
};

function exact(source, anchor, replacement, count = 1) {
  if (source.split(anchor).length !== count + 1)
    throw new Error(`Mobile WebView anchor changed: ${anchor}`);
  return source.replaceAll(anchor, replacement);
}

export async function applyMobileWebview({ stage, webRoot }) {
  const path = resolve(stage, "packages/web/src/main.tsx");
  const before = await readFile(path, "utf8");
  let source =
    'import { isFlutterMobileShell, notifyMobileProject, readMobileShellProjectKey } from "./mobileWebview.js";\n' +
    before.replace(/\r\n/g, "\n");
  source = exact(
    source,
    "  const renderExternalRelayRoot = (",
    "  const projectWorkspaceKey = readMobileShellProjectKey(location.search);\n  const flutterNavigation = isFlutterMobileShell(location.search);\n\n  const renderExternalRelayRoot = (",
  );
  source = exact(
    source,
    "            webRemoteControlWorkspaceSwitcher={{\n              deviceNavigation,",
    "            webRemoteControlWorkspaceSwitcher={{\n              projectWorkspaceKey,\n              flutterNavigation,\n              deviceNavigation,",
    2,
  );
  source = exact(
    source,
    "    if (terminated || versionGuard.isBlocked()) return;\n    ready = true;",
    "    if (terminated || versionGuard.isBlocked()) return;\n    notifyMobileProject({ ...bridge, deviceSid: relayParams.deviceSid });\n    ready = true;",
  );
  const anchor =
    "    const selectedWorkspace = resolveWebRemoteControlRecoveryTarget(bootstrapResult, options);";
  source = exact(
    source,
    anchor,
    `    // 外壳项目导航必须由当前 Host 目录核验，禁止失效项目误开默认工作区。
    if (
      !options && projectWorkspaceKey && !bootstrapResult.workspaces.some(
        (workspace) => resolveWebRemoteControlWorkspaceKey(workspace) === projectWorkspaceKey,
      )
    ) {
      throw toWebRemoteControlFailure("workspace-closed", "The selected project is no longer open on this desktop.");
    }
    const selectedWorkspace = resolveWebRemoteControlRecoveryTarget(
      bootstrapResult,
      options ?? (projectWorkspaceKey ? { preferredWorkspaceKey: projectWorkspaceKey } : undefined),
    );`,
  );
  await writeFile(path, source);
  await copyFile(
    resolve(webRoot, "src/mobileWebview.ts"),
    resolve(stage, "packages/web/src/mobileWebview.ts"),
  );
  return {
    path: "packages/web/src/main.tsx",
    upstreamSha256: hash(before),
    sha256: hash(source),
    adapterPath: "packages/web/src/mobileWebview.ts",
    adapterSha256: hash(await readFile(resolve(webRoot, "src/mobileWebview.ts"), "utf8")),
    projectFiles: await applyMobileProjectSessions(stage, webRoot),
  };
}

async function applyMobileProjectSessions(stage, webRoot) {
  const adapters = await Promise.all(
    Object.entries(MOBILE_PROJECT_ADAPTERS).map(async ([path, input]) => {
      const content = await readFile(resolve(webRoot, "../..", input));
      await writeFile(resolve(stage, path), content);
      return { path, sha256: hash(content) };
    }),
  );
  const switcher = "export interface WebRemoteControlWorkspaceSwitcherApi {";
  const types = await patchStageFile(stage, "packages/ui/src/root/types.ts", (source) =>
    exact(
      source,
      switcher,
      `${switcher}\n  /** 显式移动项目入口的原工作区键，跨根目录打开任务时保留。 */\n  projectWorkspaceKey?: string;\n  /** Flutter 始终使用移动页面，并接收目录或 Agent 呈现状态。 */\n  flutterNavigation?: boolean;`,
    ),
  );
  const index = await patchStageFile(stage, `${sidebar}/index.tsx`, (source) =>
    exact(
      'import { MobileProjectSessions } from "./MobileProjectSessions.js";\n' +
        'import { selectMobileProjectTaskScope } from "./mobileProjectTaskScope.js";\n' +
        source,
      "  // 手机远控 home-only",
      `  // 移动项目入口此前复用了设备首页，导致选择的项目范围在目录渲染时丢失。
  const switcher = props.webRemoteControlWorkspaceSwitcher;
  const projectWorkspaceKey = switcher?.projectWorkspaceKey;
  if (projectWorkspaceKey) {
    const scope = selectMobileProjectTaskScope(tree, projectWorkspaceKey);
    const project = scope?.project;
    const offline = !service || (project && availability.get(projectKey(project))?.online === false);
    let status = error ?? (scope ? hostReadErrors.get(scope.hostId) : undefined);
    if (offline) status = msg("offline");
    else if (!status && loading) status = intl.formatMessage({ id: "common.loading" });
    else if (!status && !scope) {
      status = msg("mobileWorkspaceAmbiguous");
    }
    return (
      <ProjectTaskListContext.Provider value={taskPresentation}>
        <SidebarTooltipProvider>
          <MobileProjectSessions
            name={scope?.name}
            title={intl.formatMessage({ id: "taskList.title" })}
            status={status}
            tasks={scope?.tasks}
            taskCountLabel={
              !status && scope
                ? intl.formatMessage({ id: "project.mobileTaskCount" }, { count: scope.tasks.length })
                : undefined
            }
            createLabel={msg("createTask")}
            onCreate={() => {
              if (project) props.onCreateTask({ projectId: project.id, hostId: project.hostId });
              else if (switcher?.startDraft) {
                const startDraft = switcher.startDraft;
                action(() => startDraft(projectWorkspaceKey, { mobileNavigationIntent: "chat" }));
              }
            }}
            onSelect={onSelectTask}
            refresh={refresh}
          />
        </SidebarTooltipProvider>
      </ProjectTaskListContext.Provider>
    );
  }
  // 手机远控 home-only`,
    ),
  );
  // 项目页复用两行时间线的展示，项目排序与分页仍由原来的 project kind 决定。
  const rows = await patchStageFile(stage, `${sidebar}/ProjectTaskRows.tsx`, (source) => {
    source = exact(source, "  showEmptyState = true,", "  showEmptyState = true,\n  rowVariant,");
    source = exact(
      source,
      "  showEmptyState?: boolean;",
      '  showEmptyState?: boolean;\n  rowVariant?: "timeline";',
    );
    source = exact(
      source,
      'className={kind === "pinned" || chronological ? "px-2" : undefined}',
      'className={rowVariant ? "space-y-2" : kind === "pinned" || chronological ? "px-2" : undefined}',
    );
    return exact(
      source,
      'variant={chronological ? "timeline" : "default"}',
      'variant={rowVariant ?? (chronological ? "timeline" : "default")}',
    );
  });
  const messages = await Promise.all(
    Object.entries({
      "zh-CN": ["此工作区对应多个项目，请在桌面端确认项目归属。", "{count} 个任务"],
      "en-US": [
        "This workspace matches multiple projects. Check the project assignment on the desktop.",
        "{count, plural, one {# task} other {# tasks}}",
      ],
    }).map(([locale, [message, count]]) => {
      const anchor = '  "project.connectionUnavailable":';
      return patchStageFile(stage, `packages/ui/src/i18n/locales/${locale}.ts`, (source) =>
        exact(
          source,
          anchor,
          `  "project.mobileWorkspaceAmbiguous": ${JSON.stringify(message)},\n  "project.mobileTaskCount": ${JSON.stringify(count)},\n${anchor}`,
        ),
      );
    }),
  );
  return [...adapters, types, index, rows, ...messages, ...(await applyFlutterNavigation(stage))];
}

async function applyFlutterNavigation(stage) {
  return Promise.all([
    patchStageFile(stage, "packages/ui/src/app-shell/WorkspaceShellLayout.tsx", (source) =>
      exact(
        source,
        "  const [isWebRemoteControlMobileViewport, setIsWebRemoteControlMobileViewport] = useState(\n    getIsWebRemoteControlMobileViewport,\n  );",
        `  const [isNarrowRemoteViewport, setIsWebRemoteControlMobileViewport] = useState(
    getIsWebRemoteControlMobileViewport,
  );
  const isWebRemoteControlMobileViewport =
    isNarrowRemoteViewport || webRemoteControlWorkspaceSwitcher?.flutterNavigation === true;`,
      ),
    ),
    patchStageFile(stage, "packages/ui/src/WebRemoteControlMobileShell.tsx", (source) => {
      const pageType = 'type WebRemoteControlMobilePage = "home" | "chat";';
      source = exact(
        source,
        pageType,
        `${pageType}

function reportFlutterPage(page: "browse" | "agent") {
  const message = { type: "kayingcode.mobile-page.v1", page };
  const host = window as Window & {
    KayingNavigation?: { postMessage(value: string): void };
    chrome?: { webview?: { postMessage(value: typeof message): void } };
  };
  if (host.KayingNavigation) host.KayingNavigation.postMessage(JSON.stringify(message));
  else host.chrome?.webview?.postMessage(message);
}`,
      );
      return exact(
        source,
        "  }, [isMobileViewport, currentPage]);",
        `  }, [isMobileViewport, currentPage]);

  const flutterNavigation = switcher.flutterNavigation;
  useEffect(() => {
    // 只投影已提交的网页呈现状态，外壳不参与任务导航、授权或恢复。
    if (flutterNavigation) reportFlutterPage(currentPage === "chat" ? "agent" : "browse");
  }, [currentPage, flutterNavigation]);
  useEffect(() => {
    if (flutterNavigation) return () => reportFlutterPage("browse");
  }, [flutterNavigation]);`,
      );
    }),
  ]);
}

async function patchStageFile(stage, path, transform) {
  const absolute = resolve(stage, path);
  const before = await readFile(absolute, "utf8");
  const after = transform(before.replace(/\r\n/g, "\n"));
  await writeFile(absolute, after);
  return { path, upstreamSha256: hash(before), sha256: hash(after) };
}
