// 受管 worktree 列表的读取（managed-worktrees/CONTRACT.md §2）。
// 唯一事实源是 Host 的 listWorktrees；这里只保存最近一次读取结果的展示投影，不缓存、不合并、
// 不在本地推算删除结果。没有 onDidChangeWorktrees 推送，列表按需重新读取。
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useOptionalBaseWorkspaceServices } from "@/hooks/useWorkspaceServices.js";
import { logger } from "@/logger.js";
import type { IManagedWorktreeService, ManagedWorktreeGroup } from "./contract.js";

export interface ManagedWorktreeListState {
  /** null = 尚未成功读取过。重新读取期间保留上一次结果，避免列表闪空。 */
  groups: ManagedWorktreeGroup[] | null;
  loading: boolean;
  /** 最近一次读取失败的诊断信息；成功读取后清空。 */
  error: string | null;
}

const INITIAL_STATE: ManagedWorktreeListState = {
  groups: null,
  loading: true,
  error: null,
};

export interface ManagedWorktreeListResult extends ManagedWorktreeListState {
  reload(): Promise<void>;
}

/**
 * `refreshKey` 变化时重新读取（创建记录集合、创建结束、Host 项目变更）。
 * 只采纳最后一次请求的结果；换服务/换项目/卸载后迟到的结果直接丢弃。
 */
export function useManagedWorktreeList(
  service: IManagedWorktreeService | null | undefined,
  projectId: string | null | undefined,
  refreshKey?: string,
): ManagedWorktreeListResult {
  const [state, setState] = useState<ManagedWorktreeListState>(INITIAL_STATE);
  // 删除、创建变化后都会重新读取；只采纳最后一次请求的结果，迟到的旧结果丢弃。
  const sequence = useRef(0);
  const reload = useCallback(async () => {
    if (!service || !projectId) return;
    const current = ++sequence.current;
    setState((previous) => ({ ...previous, loading: true, error: null }));
    try {
      const { groups } = await service.listWorktrees({ projectId });
      if (current !== sequence.current) return;
      setState({ groups, loading: false, error: null });
    } catch (cause) {
      if (current !== sequence.current) return;
      const message = cause instanceof Error ? cause.message : String(cause);
      logger.warn("[managed-worktree] 读取 worktree 列表失败", { projectId, error: message });
      setState((previous) => ({ ...previous, loading: false, error: message }));
    }
  }, [projectId, service]);

  useEffect(() => {
    if (!service || !projectId) {
      setState({ groups: null, loading: false, error: null });
      return;
    }
    void reload();
    return () => {
      // 换项目或卸载后不再写入旧结果。
      sequence.current += 1;
    };
  }, [projectId, refreshKey, reload, service]);

  // Context 消费方按引用比较；列表状态未变时保持同一对象，避免 Shell 流式渲染反复广播。
  return useMemo(() => ({ ...state, reload }), [reload, state]);
}

/** 订阅 Host 项目变更（state:projects）作为 worktree 列表的刷新信号。 */
export function useManagedWorktreeProjectChanges(onChange: () => void): void {
  const broadcastService = useOptionalBaseWorkspaceServices()?.broadcastService;
  const handlerRef = useRef(onChange);
  handlerRef.current = onChange;
  useEffect(() => {
    if (!broadcastService) return;
    const subscription = broadcastService.onMessage((event) => {
      if (event.channel === "state:projects") handlerRef.current();
    });
    return () => subscription.dispose();
  }, [broadcastService]);
}
