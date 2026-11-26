import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    // 组件测试使用 .tsx（jsdom + createRoot）；共享 locale 文件的 .test.ts 保持原规则。
    include: ["test/**/*.test.ts", "test/**/*.test.tsx", "src/**/*.test.ts", "src/**/*.test.tsx"],
    setupFiles: [fileURLToPath(new URL("../../vitest.setup.ts", import.meta.url))],
    hookTimeout: 30_000,
    testTimeout: 30_000,
    maxWorkers: 4,
  },
});
