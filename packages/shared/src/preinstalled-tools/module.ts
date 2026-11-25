/**
 * preinstalled-tools-contract 模块清单（architecture-governance managed 模块）。
 * 层：adapters。浏览器安全的严格 schema + Node 路径/纯字节算法，不做 IO、不发布状态。
 */
export const preinstalledToolsContractModule = {
  id: "preinstalled-tools-contract",
  requires: [],
  provides: ["preinstalled-tools-contract"],
  publicEntrypoints: ["contract.ts", "node.ts"],
} as const;
