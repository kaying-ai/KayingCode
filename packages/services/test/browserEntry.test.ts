import { build } from "esbuild";
import { expect, it } from "vitest";
import { fileURLToPath } from "node:url";

it("public descriptors bundle in browsers without Node implementations or shims", async () => {
  const result = await build({
    entryPoints: [fileURLToPath(new URL("../src/index.ts", import.meta.url))],
    bundle: true,
    platform: "browser",
    format: "esm",
    write: false,
    treeShaking: false,
    logLevel: "silent",
  });
  expect(result.outputFiles[0]?.text).toContain("project");
});
