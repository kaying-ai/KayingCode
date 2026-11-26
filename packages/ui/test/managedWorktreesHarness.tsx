// managed-worktrees 组件测试的共享 harness：jsdom 渲染、事件分发与 Host 服务 double。
// 不注册测试用例；每个 .test.tsx 仍各自安装 Intl mock（vi.mock 必须留在测试文件顶层）。
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { expect, vi } from "vitest";
import type { Event } from "@zcode/rpc";
import type { IServiceAccessor } from "@zcode/services";
import type {
  IManagedWorktreeService,
  ManagedWorktreeCreation,
  ManagedWorktreeCreationSettlement,
  ManagedWorktreeEntry,
  ManagedWorktreeGroup,
} from "@/managed-worktrees/index.js";
import { useKayingCodeSessionStore } from "@/store/kayingcodeSessionStore.js";
import { useRemoteWorkspaceSessionStore } from "@/store/remoteWorkspaceSessionStore.js";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

// Radix Popover/DropdownMenu 的定位在打开时使用 ResizeObserver；jsdom 没有实现。
// 只提供空操作实现，测试断言菜单结构与回调，不校验实际像素位置。
if (typeof globalThis.ResizeObserver === "undefined") {
  class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  (globalThis as typeof globalThis & { ResizeObserver: typeof ResizeObserver }).ResizeObserver =
    ResizeObserverStub as unknown as typeof ResizeObserver;
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;

export function render(children: ReactNode): void {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(children));
}

export function rerender(children: ReactNode): void {
  act(() => root?.render(children));
}

export async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

export function query(testId: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
}

export async function clickAsync(element: HTMLElement | null): Promise<void> {
  expect(element).not.toBeNull();
  await act(async () => {
    element?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await settle();
}

export function cleanup(): void {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  document.body.innerHTML = "";
}

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

export function createEvent<T>() {
  const listeners = new Set<(value: T) => void>();
  const event: Event<T> = (listener) => {
    listeners.add(listener);
    return { dispose: () => listeners.delete(listener) };
  };
  return {
    event,
    emit(value: T) {
      for (const listener of listeners) listener(value);
    },
  };
}

export function createService(overrides: Partial<IManagedWorktreeService> = {}) {
  const changes = createEvent<ManagedWorktreeCreation[]>();
  const settlements = createEvent<ManagedWorktreeCreationSettlement>();
  const service = {
    startNewTask: vi.fn(async () => ({ ok: true as const, creationId: "c1" })),
    forkToWorktree: vi.fn(async () => ({ ok: true as const, creationId: "c1" })),
    retryCreation: vi.fn(async () => {}),
    continueWithoutWorktree: vi.fn(async () => {}),
    dismissCreation: vi.fn(async () => {}),
    listCreations: vi.fn(async () => [] as ManagedWorktreeCreation[]),
    onDidChangeCreations: changes.event,
    onDidSettleCreation: settlements.event,
    listWorktrees: vi.fn(async () => ({ groups: [] as ManagedWorktreeGroup[] })),
    removeWorktree: vi.fn(async () => ({ ok: true as const })),
    pruneWorktrees: vi.fn(async () => {}),
    listStartRefs: vi.fn(async () => null),
    isWorktreeAvailable: vi.fn(async () => true),
    supportsWorktreeCwd: vi.fn(async () => false),
    ...overrides,
  } as unknown as IManagedWorktreeService;
  return { service, emitChanges: changes.emit, emitSettlement: settlements.emit };
}

export function creation(
  overrides: Partial<ManagedWorktreeCreation> = {},
): ManagedWorktreeCreation {
  return {
    id: "c1",
    kind: "new-task",
    projectId: "p1",
    workspacePath: "/repo",
    phase: "creating",
    ref: null,
    worktreePath: null,
    output: "",
    error: null,
    promptText: "hello worktree",
    parentSessionId: null,
    createdAt: 1,
    ...overrides,
  };
}

export function worktreeEntry(overrides: Partial<ManagedWorktreeEntry> = {}): ManagedWorktreeEntry {
  return {
    path: "/managed/3f2a/repo",
    bucket: "3f2a",
    sourceRoot: "/repo",
    head: "abcdef1234567",
    branchName: "feature/x",
    state: "ok",
    dirty: false,
    creating: false,
    tasks: [{ taskId: "t1", workspacePath: "/repo", title: "Task one", archived: false }],
    ...overrides,
  };
}

export function group(worktrees: ManagedWorktreeEntry[]): ManagedWorktreeGroup {
  return { sourceRoot: "/repo", worktrees };
}

/** 把 worktree 服务 double 装进 base services：Provider 固定从本机 base accessor 读取。 */
export function installBaseManagedWorktreeService(service: IManagedWorktreeService | null): void {
  useRemoteWorkspaceSessionStore.setState({
    baseServices: service
      ? ({ managedWorktreeService: service } as unknown as IServiceAccessor)
      : null,
  });
}

/** 测试间重置 session store 与 base services；模块内 projection 由各自 reset 负责。 */
export function resetManagedWorktreeTestStores(): void {
  installBaseManagedWorktreeService(null);
  useKayingCodeSessionStore.setState({ workspaces: {} });
}
