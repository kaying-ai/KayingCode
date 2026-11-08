import { defineConfig } from "vitest/config";

// 根历史 projects 包含已退役应用；核心测试只读取本包场景，避免测试入口重新依赖旧 CUA。
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    maxWorkers: 4,
    testTimeout: 30_000,
  },
});
