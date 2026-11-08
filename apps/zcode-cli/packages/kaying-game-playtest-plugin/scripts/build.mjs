import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { build } from "esbuild";

const root = resolve(import.meta.dirname, "..");
await mkdir(resolve(root, "dist/mcp"), { recursive: true });
await build({
  bundle: true,
  entryPoints: [resolve(root, "runtime/server.mjs")],
  outfile: resolve(root, "dist/mcp/server.js"),
  platform: "node",
  target: "node24",
  format: "esm",
  legalComments: "none",
});
