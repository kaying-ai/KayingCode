import { useMemo } from "react";
import { getMcpAuthorityStore, useMcpStore } from "@/store/mcpStore.js";

/**
 * 设置页按 authority 选择 MCP store：缺省使用活动 workspace 的默认单例；
 * Source user scope 使用该 authority 的隔离实例，读写都不会回落到默认 store。
 */
export function useMcpStoreInstance(authorityKey?: string): typeof useMcpStore {
  return useMemo(
    () => (authorityKey?.trim() ? getMcpAuthorityStore(authorityKey) : useMcpStore),
    [authorityKey],
  );
}
