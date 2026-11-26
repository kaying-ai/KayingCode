import { useState } from "react";
import type { PreinstalledToolsCommand } from "@zcode/shared/preinstalled-tools";
import { usePlatform } from "@/hooks/usePlatform.js";
import { logger } from "@/logger.js";

/**
 * 预装工具命令。
 *
 * 回执只结束本次控件请求，不携带也不替换快照；显示状态始终来自预装进程推送的完整状态。
 */
export function usePreinstalledCommand() {
  const platform = usePlatform();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const execute = async (command: PreinstalledToolsCommand) => {
    setPending(true);
    setError(false);
    try {
      if (!platform.executePreinstalledToolsCommand) throw new Error("预装工具命令不可用");
      // 回执只结束本次控件请求；显示状态始终来自 owner 的完整快照。
      await platform.executePreinstalledToolsCommand(command);
    } catch (cause) {
      logger.warn("[PreinstalledTools] 操作失败", { command, error: cause });
      setError(true);
    } finally {
      setPending(false);
    }
  };
  return { execute, pending, error };
}
