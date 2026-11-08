import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

const packageRoot = resolve(import.meta.dirname, "..");
const outfile = resolve(packageRoot, "dist", "mcp", "server.js");
const nodeRequireBanner = `import { createRequire as __kayingcodeCreateRequire } from "node:module";
const require = __kayingcodeCreateRequire(import.meta.url);`;

export async function buildTapTapMakerPlugin() {
  await mkdir(dirname(outfile), { recursive: true });
  await build({
    banner: { js: nodeRequireBanner },
    bundle: true,
    entryPoints: [resolve(packageRoot, "src", "mcp", "server.ts")],
    format: "esm",
    legalComments: "none",
    outfile,
    platform: "node",
    target: "node24",
  });
  return outfile;
}

const entryPath = process.argv[1];
if (entryPath && import.meta.url === pathToFileURL(entryPath).href) {
  console.log(`[kaying-for-taptap] ${await buildTapTapMakerPlugin()}`);
}
