import { defineConfig } from "vitest/config";

// 本包测试只读取自身场景；根 config 的 projects 面向 packages/*，不覆盖 apps/zcode-cli。
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts", "test/**/*.test.ts"],
    environment: "node",
    maxWorkers: 4,
    testTimeout: 30_000,
  },
});
