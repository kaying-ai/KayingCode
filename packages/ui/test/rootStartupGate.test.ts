import assert from "node:assert/strict";
import { test } from "vitest";
import {
  shouldAwaitStartupWorkspaceResolution,
  shouldBlockRootRender,
  shouldShowRootStartupLoading,
} from "../src/lib/rootStartupGate.js";

/** 上游门禁全部解开后的桌面端基线：还在等首个 workspace 落定。 */
function desktopAwaitingWorkspace(overrides: Record<string, unknown> = {}) {
  return {
    isDesktop: true,
    isStartupWorkspaceResolved: false,
    workspaceShellPath: null,
    isSettingsTabActive: false,
    allowOpenWorkspace: true,
    isStartupProviderLoginEntryOpen: false,
    welcomeScreenOpen: false,
    isResolvingStartupAuthState: false,
    isResolvingProviderStartupState: false,
    isRestoring: false,
    isBootstrappingInitialWorkspace: false,
    ...overrides,
  } as Parameters<typeof shouldAwaitStartupWorkspaceResolution>[0];
}

test("启动 workspace 兜底窗口纳入启动阻塞，避免主界面闪一帧后再弹呼吸 loading", () => {
  const gate = desktopAwaitingWorkspace();
  assert.equal(shouldAwaitStartupWorkspaceResolution(gate), true);
  // 回归点：兜底创建是在 effect 里发起的，这一帧门禁必须还是阻塞态。
  assert.equal(
    shouldShowRootStartupLoading({
      isDesktop: gate.isDesktop,
      welcomeScreenOpen: gate.welcomeScreenOpen,
      isResolvingStartupAuthState: gate.isResolvingStartupAuthState,
      isResolvingProviderStartupState: gate.isResolvingProviderStartupState,
      isRestoring: gate.isRestoring,
      isBootstrappingInitialWorkspace: shouldAwaitStartupWorkspaceResolution(gate),
    }),
    true,
  );
});

test("上游还没解开时不重复阻塞，交给原有门禁输入表达", () => {
  for (const upstream of [
    { isResolvingStartupAuthState: true },
    { isResolvingProviderStartupState: true },
    { isRestoring: true },
    { isBootstrappingInitialWorkspace: true },
  ]) {
    const gate = desktopAwaitingWorkspace(upstream);
    assert.equal(shouldBlockRootRender(gate), true);
    assert.equal(shouldAwaitStartupWorkspaceResolution(gate), false);
  }
});

test("解析期已结束（关闭最后一个 tab）不再阻塞", () => {
  assert.equal(
    shouldAwaitStartupWorkspaceResolution(
      desktopAwaitingWorkspace({ isStartupWorkspaceResolved: true }),
    ),
    false,
  );
});

test("恢复命中 workspace shell 时不阻塞，也不额外等待兜底", () => {
  assert.equal(
    shouldAwaitStartupWorkspaceResolution(
      desktopAwaitingWorkspace({ workspaceShellPath: "/tmp/workspace" }),
    ),
    false,
  );
});

test("设置页 / 欢迎页 / 登录入口 / 不允许打开工作区都豁免解析期阻塞", () => {
  for (const exempt of [
    { isSettingsTabActive: true },
    { welcomeScreenOpen: true },
    { isStartupProviderLoginEntryOpen: true },
    { allowOpenWorkspace: false },
  ]) {
    assert.equal(
      shouldAwaitStartupWorkspaceResolution(desktopAwaitingWorkspace(exempt)),
      false,
      `expected exempt: ${JSON.stringify(exempt)}`,
    );
  }
});

test("非桌面端不参与启动 workspace 解析期阻塞", () => {
  assert.equal(
    shouldAwaitStartupWorkspaceResolution(desktopAwaitingWorkspace({ isDesktop: false })),
    false,
  );
});
