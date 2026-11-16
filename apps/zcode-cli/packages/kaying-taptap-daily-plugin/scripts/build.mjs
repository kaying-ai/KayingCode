import { mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { build } from "esbuild";

const root = resolve(import.meta.dirname, "..");
const dist = resolve(root, "dist");
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

await build({
  entryPoints: {
    collector: resolve(root, "src/collector/main.ts"),
    metrics: resolve(root, "src/metrics/main.ts"),
    renderer: resolve(root, "src/renderer/main.ts"),
  },
  outdir: dist,
  bundle: true,
  platform: "node",
  target: "node24",
  format: "esm",
  outExtension: { ".js": ".mjs" },
  legalComments: "none",
  sourcemap: true,
});
