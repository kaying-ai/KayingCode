// worktree 创建记录的订阅（managed-worktrees/CONTRACT.md §2）。记录只在 Host 内存中，是创建阶段的
// 唯一数据源：这里只镜像 Host 推送的完整列表，不在 renderer 推算阶段或进度。
import { useCallback, useEffect, useRef, useState } from "react";
import { useOptionalBaseWorkspaceServices } from "@/hooks/useWorkspaceServices.js";
import { logger } from "@/logger.js";
import type {
  IManagedWorktreeService,
  ManagedWorktreeCreation,
  ManagedWorktreeCreationSettlement,
} from "./contract.js";

const EMPTY: readonly ManagedWorktreeCreation[] = [];

/**
 * 创建记录只属于本机 Host：固定从 base services 读取，当前 tab 是远端时不会把订阅
 * 发到不存在的 managed-worktrees 频道。
 */
export function useBaseManagedWorktreeService(): IManagedWorktreeService | undefined {
  return useOptionalBaseWorkspaceServices()?.managedWorktreeService;
}

export function useManagedWorktreeCreations(
  service: IManagedWorktreeService | null | undefined,
): readonly ManagedWorktreeCreation[] {
  const [creations, setCreations] = useState<readonly ManagedWorktreeCreation[]>(EMPTY);
  // 订阅代次：服务实例变化或 effect 重跑后，旧代次的异步读取结果不得写入。
  const generationRef = useRef(0);
  useEffect(() => {
    const generation = ++generationRef.current;
    if (!service) return;
    // 先订阅再读取：读取返回前到达的推送更新，读取结果只在还没收到推送时采用。
    let pushed = false;
    const subscription = service.onDidChangeCreations((next) => {
      if (generation !== generationRef.current) return;
      pushed = true;
      setCreations(next);
    });
    void service.listCreations().then(
      (initial) => {
        if (generation !== generationRef.current || pushed) return;
        setCreations(initial);
      },
      (error: unknown) => logger.warn("[worktree] 读取创建记录失败", { error }),
    );
    return () => {
      subscription.dispose();
      // 卸载或换服务后，未完成的读取一律视为过期。
      if (generationRef.current === generation) generationRef.current += 1;
    };
  }, [service]);
  return service ? creations : EMPTY;
}

/** 订阅创建结束事件；handler 由调用方 memo。 */
export function useManagedWorktreeSettlements(
  service: IManagedWorktreeService | null | undefined,
  handler: (settlement: ManagedWorktreeCreationSettlement) => void,
): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  const stableHandler = useCallback(
    (settlement: ManagedWorktreeCreationSettlement) => handlerRef.current(settlement),
    [],
  );
  useEffect(() => {
    if (!service) return;
    const subscription = service.onDidSettleCreation(stableHandler);
    return () => subscription.dispose();
  }, [service, stableHandler]);
}
