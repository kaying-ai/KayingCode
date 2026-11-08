// Taro 壳模块清单（架构治理：与 architecture-policy.yaml 的 mobile 条目一致）。
export const mobileModule = {
  id: "mobile",
  requires: ["shared", "client", "mobile-client-core"],
  provides: ["surface.mobile-app-shell"],
  publicEntrypoints: ["app.tsx"],
} as const;
