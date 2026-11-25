/**
 * desktop-preinstalled-tools 模块清单（architecture-governance managed 模块）。
 * 层：adapters。Main 侧 catalog 装配、utilityProcess 生命周期与 IPC；进程内协调器、安装 owner 与入口。
 * 本仓尚未在 architecture-policy.yaml 登记该模块（登记属于架构策略波次），清单先与代码边界保持一致。
 */
export const desktopPreinstalledToolsModule = {
  id: "desktop-preinstalled-tools",
  requires: ["desktop", "services", "shared", "preinstalled-tools-contract"],
  provides: ["desktop-preinstalled-tools"],
  publicEntrypoints: ["index.ts", "contract.ts"],
} as const;
