// 草稿 worktree 起点的跨组件通道（managed-worktrees/CONTRACT.md §7）。
// composer 头部的开关由 app shell 持有并渲染；SessionPane 的发送路径不在同一条 props 链上，
// 因此入口把受控值镜像到这里，发送时按 workspace 读取当前选择。
// 单一写入者：`ManagedWorktreeComposerEntry`（受控 props 的投影），不保存第二份可编辑状态。
import { useSyncExternalStore } from "react";

/**
 * `undefined`：未启用；`null`：启用并从当前 HEAD 检出；`string`：启用并指定起点。
 * 与入口的受控 props 语义一致。
 */
export type WorktreeDraftSelection = string | null | undefined;

type Listener = () => void;

const selections = new Map<string, WorktreeDraftSelection>();
const listeners = new Set<Listener>();

function workspaceKey(workspacePath: string, workspaceIdentity?: string): string {
  return `${workspaceIdentity?.trim() ?? ""}\u0000${workspacePath}`;
}

function emit(): void {
  for (const listener of listeners) listener();
}

/** 入口渲染时把受控值投影到这里；值未变化时不触发订阅者。 */
export function publishWorktreeDraftSelection(
  workspacePath: string,
  workspaceIdentity: string | undefined,
  selection: WorktreeDraftSelection,
): void {
  const key = workspaceKey(workspacePath, workspaceIdentity);
  if (selections.get(key) === selection) return;
  selections.set(key, selection);
  emit();
}

/** 发送路径在点击时读取当前选择；不是订阅，避免把一次发送绑定到旧的 render。 */
export function readWorktreeDraftSelection(
  workspacePath: string,
  workspaceIdentity?: string,
): WorktreeDraftSelection {
  return selections.get(workspaceKey(workspacePath, workspaceIdentity));
}

export function clearWorktreeDraftSelection(
  workspacePath: string,
  workspaceIdentity?: string,
): void {
  const key = workspaceKey(workspacePath, workspaceIdentity);
  if (!selections.delete(key)) return;
  emit();
}

function subscribeWorktreeDraftSelection(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** 供组件按需订阅（例如显示“起点已选择”）；发送路径用同步读取即可。 */
export function useWorktreeDraftSelection(
  workspacePath: string,
  workspaceIdentity?: string,
): WorktreeDraftSelection {
  return useSyncExternalStore(
    subscribeWorktreeDraftSelection,
    () => readWorktreeDraftSelection(workspacePath, workspaceIdentity),
    () => undefined,
  );
}

/** 仅测试清理；生产没有跨 workspace 批量重置的需求。 */
export function resetWorktreeDraftSelectionsForTests(): void {
  if (selections.size === 0) return;
  selections.clear();
  emit();
}
