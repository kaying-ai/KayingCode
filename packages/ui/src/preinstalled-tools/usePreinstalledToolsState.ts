import { useEffect, useState } from "react";
import type { PreinstalledToolsState } from "@zcode/shared/preinstalled-tools";
import { usePlatform } from "@/hooks/usePlatform.js";
import { logger } from "@/logger.js";

/**
 * 预装工具快照订阅。
 *
 * 打开对话框时先订阅推送再查询初始快照：推送是唯一权威状态，查询只补齐首屏；
 * 推送先到时忽略迟到的查询结果，避免旧快照回滚。
 */
export function usePreinstalledToolsState(open: boolean) {
  const platform = usePlatform();
  const [state, setState] = useState<PreinstalledToolsState | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  useEffect(() => {
    if (!open) return;
    setState(null);
    setLoadFailed(false);
    let active = true;
    let eventReceived = false;
    // 先订阅再查询：推送快照是唯一权威状态，查询只是首屏补齐。
    const dispose = platform.onPreinstalledToolsState?.((snapshot) => {
      eventReceived = true;
      if (active) setState(snapshot);
    });
    void platform.getPreinstalledToolsState?.().then(
      (snapshot) => {
        // 推送先到时，迟到的初始查询不能回滚工具状态。
        if (active && !eventReceived) setState(snapshot);
      },
      (error) => {
        logger.warn("[PreinstalledTools] 读取状态失败", { error });
        // 修复原因：预装进程在初始化前退出后，Main 让查询以错误结束且不再推送状态；此前这里只记日志，
        // state 保持 null，对话框永远显示“正在读取…”。读取失败要结束加载，之后若有推送仍按推送显示。
        if (active && !eventReceived) setLoadFailed(true);
      },
    );
    return () => {
      active = false;
      dispose?.();
    };
  }, [open, platform]);
  return { state, loadFailed };
}
