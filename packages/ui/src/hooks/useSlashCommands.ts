/**
 * KayingCode Agent Slash Commands 便捷 hook
 *
 * 返回当前 workspace 下 Agent 广播的可用 slash commands 列表。
 */
import { useKayingCodeSessionStore, selectWorkspaceKayingCodeState } from "../store/kayingcodeSessionStore.js";

export function useSlashCommands(workspacePath: string, workspaceIdentity?: string) {
  return useKayingCodeSessionStore(
    (state) => selectWorkspaceKayingCodeState(state, workspacePath, workspaceIdentity).slashCommands,
  );
}
