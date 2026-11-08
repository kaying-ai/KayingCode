import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    setupFiles: [fileURLToPath(new URL("../../vitest.setup.ts", import.meta.url))],
    hookTimeout: 30_000,
    testTimeout: 30_000,
    maxWorkers: 4,
  },
});
