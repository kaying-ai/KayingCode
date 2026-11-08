import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = resolve(packageRoot, "dist");
const outputPath = resolve(outputRoot, "mcp", "server.js");

export async function buildComputerUsePluginWrapper() {
  await rm(outputRoot, { recursive: true, force: true });
  await mkdir(dirname(outputPath), { recursive: true });
  await cp(resolve(packageRoot, "src", "server.js"), outputPath);
  process.stdout.write(`[computer-use] built ${outputPath}\n`);
  return outputPath;
}

const entryPath = process.argv[1];
if (entryPath && import.meta.url === pathToFileURL(entryPath).href) {
  await buildComputerUsePluginWrapper();
}
