// @vitest-environment jsdom
/**
 * 预装工具对话框行为测试。
 *
 * 该包 vitest.config.ts 的 include 只覆盖 test 与 src 下的 .test.ts 文件（与 settingsSearchRowTarget.test.ts
 * 一致），因此这里用 createElement 代替 JSX，保持文件能被定向与全量测试直接发现。
 */
import { act, createElement, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { IPlatformService } from "@zcode/shared";
import type {
  PreinstalledToolsCommand,
  PreinstalledToolsState,
  PreinstalledToolState,
} from "@zcode/shared/preinstalled-tools";
import { TooltipProvider } from "@/components/ui/tooltip.js";
import { PlatformProvider } from "@/hooks/usePlatform.js";
import { KayingCodeIntlProvider } from "@/i18n/IntlProvider.js";
import enUS from "@/i18n/locales/en-US.js";
import { PreinstalledToolsDialog } from "@/preinstalled-tools/PreinstalledToolsDialog.js";
import { WorkspaceHelpMenuButton } from "@/WorkspaceHelpMenuButton.js";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const h = createElement;
const TOOL_ID = "python";
const PREINSTALLED_ENTRY = "workspace-help-menu-preinstalled-tools";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function baseTool(overrides: Partial<PreinstalledToolState> = {}): PreinstalledToolState {
  return {
    toolId: TOOL_ID,
    displayName: "Python",
    status: "not-installed",
    target: {
      resourceId: "python-3.12.0-r1",
      version: "3.12.0",
      archiveSizeBytes: 120 * 1024 * 1024,
      installedSizeBytes: 600 * 1024 * 1024,
    },
    installed: null,
    agentEnabled: true,
    entryOutOfSync: false,
    ...overrides,
  };
}

function baseState(overrides: Partial<PreinstalledToolsState> = {}): PreinstalledToolsState {
  return { autoInstallEnabled: false, tools: [baseTool()], ...overrides };
}

type PlatformMethod = "getPreinstalledToolsState" | "executePreinstalledToolsCommand";

interface PlatformStub {
  platform: IPlatformService;
  calls: string[];
  commands: PreinstalledToolsCommand[];
  push(state: PreinstalledToolsState): void;
}

function createPlatform(options: {
  omit?: Array<PlatformMethod | "onPreinstalledToolsState">;
  initial?: PreinstalledToolsState;
  initialPromise?: Promise<PreinstalledToolsState>;
}): PlatformStub {
  const calls: string[] = [];
  const commands: PreinstalledToolsCommand[] = [];
  let push: (state: PreinstalledToolsState) => void = () => {};
  const stub: Record<string, unknown> = {
    executeDesktopCommand: vi.fn(async () => undefined),
    openExternal: vi.fn(async () => true),
  };
  if (!options.omit?.includes("getPreinstalledToolsState")) {
    stub.getPreinstalledToolsState = vi.fn(() => {
      calls.push("query");
      return options.initialPromise ?? Promise.resolve(options.initial ?? baseState());
    });
  }
  if (!options.omit?.includes("executePreinstalledToolsCommand")) {
    stub.executePreinstalledToolsCommand = vi.fn(async (command: PreinstalledToolsCommand) => {
      calls.push(`command:${command.type}`);
      commands.push(command);
    });
  }
  if (!options.omit?.includes("onPreinstalledToolsState")) {
    stub.onPreinstalledToolsState = vi.fn((callback: (state: PreinstalledToolsState) => void) => {
      calls.push("subscribe");
      push = callback;
      return () => {
        calls.push("unsubscribe");
      };
    });
  }
  // 推送回调在订阅时写入，必须通过 wrapper 读取最新引用。
  return {
    platform: stub as unknown as IPlatformService,
    calls,
    commands,
    push: (state: PreinstalledToolsState) => push(state),
  };
}

function render(element: ReactElement): void {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(element));
}

function renderDialog(platform: IPlatformService, open = true): void {
  render(
    h(
      KayingCodeIntlProvider,
      { initialLocale: "en-US" },
      h(
        PlatformProvider,
        { platform },
        h(PreinstalledToolsDialog, { open, onOpenChange: () => undefined }),
      ),
    ),
  );
}

function renderHelpMenu(platform: IPlatformService, isDesktop = true): void {
  render(
    h(
      KayingCodeIntlProvider,
      { initialLocale: "en-US" },
      h(
        PlatformProvider,
        { platform },
        h(TooltipProvider, null, h(WorkspaceHelpMenuButton, { isDesktop })),
      ),
    ),
  );
}

async function flush(rounds = 3): Promise<void> {
  for (let index = 0; index < rounds; index += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

async function click(element: Element | null | undefined): Promise<void> {
  expect(element).toBeTruthy();
  await act(async () => {
    element?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function byTestId(id: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
}

async function openHelpMenu(): Promise<void> {
  const trigger = byTestId("workspace-help-menu-trigger");
  expect(trigger).toBeTruthy();
  await act(async () => {
    trigger?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  await flush(1);
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  document.body.innerHTML = "";
});

describe("PreinstalledToolsDialog capability detection", () => {
  it("在 Web/手机等缺少平台方法时不渲染帮助菜单入口", async () => {
    for (const missing of [
      "getPreinstalledToolsState",
      "executePreinstalledToolsCommand",
      "onPreinstalledToolsState",
    ] as const) {
      const { platform } = createPlatform({ omit: [missing] });
      renderHelpMenu(platform);
      await openHelpMenu();
      expect(byTestId(PREINSTALLED_ENTRY)).toBeNull();
      expect(byTestId("preinstalled-tools-dialog")).toBeNull();
      act(() => root?.unmount());
      root = null;
      container?.remove();
      container = null;
      document.body.innerHTML = "";
    }
  });

  it("桌面端方法齐全时渲染入口并在点击后打开对话框", async () => {
    const { platform } = createPlatform({});
    renderHelpMenu(platform);
    await openHelpMenu();
    const entry = byTestId(PREINSTALLED_ENTRY);
    expect(entry).toBeTruthy();
    expect(entry?.textContent).toContain(enUS["preinstalledTools.title"]);

    await click(entry);
    await flush();
    expect(byTestId("preinstalled-tools-dialog")).toBeTruthy();
  });

  it("非桌面端即使方法齐全也不渲染入口", async () => {
    const { platform } = createPlatform({});
    renderHelpMenu(platform, false);
    await openHelpMenu();
    expect(byTestId(PREINSTALLED_ENTRY)).toBeNull();
  });
});

describe("PreinstalledToolsDialog subscription ordering", () => {
  it("先订阅推送再查询初始状态", async () => {
    const stub = createPlatform({});
    renderDialog(stub.platform);
    await flush();
    expect(stub.calls.slice(0, 2)).toEqual(["subscribe", "query"]);
  });

  it("忽略推送之后才到达的初始查询结果", async () => {
    const pending = deferred<PreinstalledToolsState>();
    const stub = createPlatform({ initialPromise: pending.promise });
    renderDialog(stub.platform);
    await flush(1);

    // 推送先到：已就绪 + 自动预装开启。
    await act(async () => {
      stub.push(
        baseState({
          autoInstallEnabled: true,
          tools: [
            baseTool({
              status: "ready",
              installed: {
                resourceId: "python-3.12.0-r1",
                version: "3.12.0",
                installedSizeBytes: 600 * 1024 * 1024,
              },
            }),
          ],
        }),
      );
    });
    await flush(1);
    expect(byTestId("preinstalled-tools-status")?.dataset.status).toBe("ready");
    expect(byTestId("preinstalled-tools-auto-install")?.dataset.state).toBe("checked");

    // 迟到的初始查询返回旧快照，不能回滚已推送状态。
    await act(async () => {
      pending.resolve(baseState({ autoInstallEnabled: false }));
      await pending.promise;
    });
    await flush();
    expect(byTestId("preinstalled-tools-status")?.dataset.status).toBe("ready");
    expect(byTestId("preinstalled-tools-auto-install")?.dataset.state).toBe("checked");
  });
});

describe("PreinstalledToolsDialog commands", () => {
  it("命令回执不替换快照，只有推送改变状态", async () => {
    const stub = createPlatform({});
    renderDialog(stub.platform);
    await flush();
    expect(byTestId("preinstalled-tools-status")?.dataset.status).toBe("not-installed");

    await click(byTestId("preinstalled-tools-download"));
    expect(stub.commands).toEqual([{ type: "prepare", toolId: TOOL_ID }]);
    // 回执成功但没有推送：状态保持 not-installed。
    expect(byTestId("preinstalled-tools-status")?.dataset.status).toBe("not-installed");

    await act(async () => {
      stub.push(baseState({ tools: [baseTool({ status: "preparing", phase: "downloading" })] }));
    });
    await flush(1);
    expect(byTestId("preinstalled-tools-status")?.dataset.status).toBe("preparing");
    expect(byTestId("preinstalled-tools-cancel")).toBeTruthy();
  });

  it("自动预装开关发送命令，显示值等待推送", async () => {
    const stub = createPlatform({});
    renderDialog(stub.platform);
    await flush();
    const toggle = byTestId("preinstalled-tools-auto-install");
    expect(toggle?.dataset.state).toBe("unchecked");

    await click(toggle);
    expect(stub.commands).toEqual([{ type: "set-auto-install", enabled: true }]);
    // 没有推送时开关保持原值，不乐观更新。
    expect(byTestId("preinstalled-tools-auto-install")?.dataset.state).toBe("unchecked");

    await act(async () => {
      stub.push(baseState({ autoInstallEnabled: true }));
    });
    await flush(1);
    expect(byTestId("preinstalled-tools-auto-install")?.dataset.state).toBe("checked");
  });

  it("删除需要确认，占用时显示提示且不自动重试", async () => {
    const installed = {
      resourceId: "python-3.12.0-r1",
      version: "3.12.0",
      installedSizeBytes: 600 * 1024 * 1024,
    };
    const stub = createPlatform({
      initial: baseState({ tools: [baseTool({ status: "ready", installed })] }),
    });
    renderDialog(stub.platform);
    await flush();

    await click(byTestId("preinstalled-tools-delete"));
    expect(byTestId("preinstalled-tools-delete-confirm")).toBeTruthy();
    // 只打开确认框，还没有发送删除命令。
    expect(stub.commands).toEqual([]);

    await click(byTestId("preinstalled-tools-delete-confirm-accept"));
    await flush();
    expect(stub.commands).toEqual([{ type: "delete", toolId: TOOL_ID }]);
    expect(byTestId("preinstalled-tools-delete-confirm")).toBeNull();

    // 预装进程报告占用：显示占用提示，且不再自动重发删除命令。
    await act(async () => {
      stub.push(
        baseState({ tools: [baseTool({ status: "ready", installed, deletionBlocked: true })] }),
      );
    });
    await flush(1);
    const blocked = byTestId("preinstalled-tools-delete-blocked");
    expect(blocked).toBeTruthy();
    expect(blocked?.textContent).toContain("Python");
    expect(stub.commands).toEqual([{ type: "delete", toolId: TOOL_ID }]);
  });
});
