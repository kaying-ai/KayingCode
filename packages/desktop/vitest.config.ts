import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // main/host 源码用 tsconfig 的 @desktop/* 别名指向 src；vitest 不会读取 tsconfig paths，
    // 单元测试 import 源码时必须显式保留同一映射。
    alias: {
      "@desktop": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    include: ["test/**/*.test.ts", "src/**/*.test.ts"],
    setupFiles: [fileURLToPath(new URL("../../vitest.setup.ts", import.meta.url))],
    hookTimeout: 30_000,
    testTimeout: 30_000,
    maxWorkers: 4,
  },
});
