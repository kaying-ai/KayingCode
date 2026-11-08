import { access, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadOfficialPluginCatalog } from "../../../../../scripts/official-plugin-catalog.mjs";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = resolve(packageRoot, "../../../..");

async function readJson(relativePath) {
  return JSON.parse(await readFile(join(packageRoot, relativePath), "utf8"));
}

const [packageJson, manifest, upstreamLock, upstreamPackage] = await Promise.all([
  readJson("package.json"),
  readJson(join(".kayingcode-plugin", "plugin.json")),
  readJson("upstream-lock.json"),
  readJson(join("vendor", "kaying-computer-use", "package.json")),
]);

if (packageJson.version !== manifest.version) {
  throw new Error(
    `Computer Use package/manifest version mismatch: ${packageJson.version} != ${manifest.version}`,
  );
}
if (upstreamLock.version !== upstreamPackage.version) {
  throw new Error(
    `Computer Use upstream lock/source version mismatch: ${upstreamLock.version} != ${upstreamPackage.version}`,
  );
}
if (!/^[0-9a-f]{40}$/u.test(upstreamLock.commit)) {
  throw new Error(`Computer Use upstream lock has invalid commit: ${upstreamLock.commit}`);
}

// 修复依据：版本已由 catalog 读取真实 manifest，正则扫描下游源码会把正确构建误判为版本缺失。
const catalog = await loadOfficialPluginCatalog(repositoryRoot);
const definition = catalog.plugins.find(({ name }) => name === manifest.name);
if (!definition || definition.version !== packageJson.version) {
  throw new Error(`Computer Use release catalog is not version ${packageJson.version}`);
}

for (const relativePath of [
  "LICENSE",
  "THIRD_PARTY_NOTICES.md",
  join("dist", "mcp", "server.js"),
  join("docs", "computer-use.md"),
  join("skills", "computer-use", "SKILL.md"),
  join("vendor", "kaying-computer-use", "apps", "OpenComputerUseWindows", "main.go"),
  join("vendor", "kaying-computer-use", "apps", "OpenComputerUseLinux", "main.go"),
  join("vendor", "kaying-computer-use", "packages", "OpenComputerUseKit", "Sources"),
]) {
  await access(join(packageRoot, relativePath));
}

process.stdout.write(
  `[computer-use] plugin ${packageJson.version}, upstream ${upstreamLock.version} (${upstreamLock.commit.slice(0, 12)})\n`,
);
