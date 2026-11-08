import { access, readFile, readdir } from "node:fs/promises";
import { parse as parseYaml } from "yaml";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const sourceRoots = ["apps", "packages", "plugins", "tools"];
const nestedSourceRoots = ["apps/zcode-cli/packages", "apps/zcode-cli/tools"];
const workspacePatterns = [
  "apps/*",
  "packages/*",
  "tools/*",
  "apps/zcode-cli/packages/*",
  "apps/zcode-cli/tools/*",
];
const dependencyFields = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
];

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

export async function readSourcePackages(root, { onMissing = () => {} } = {}) {
  const packages = [];
  for (const directory of [...sourceRoots, ...nestedSourceRoots]) {
    let children;
    try {
      children = await readdir(join(root, directory), { withFileTypes: true });
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      onMissing(directory);
      continue;
    }
    for (const child of children) {
      if (!child.isDirectory()) continue;
      const file = `${directory}/${child.name}/package.json`;
      if (!(await exists(join(root, file)))) continue;
      packages.push({ file, manifest: JSON.parse(await readFile(join(root, file), "utf8")) });
    }
  }
  return packages.sort((a, b) => a.file.localeCompare(b.file));
}

// 只检查源码包的一级清单；vendor、Flutter 和生成制品不属于 TS 工作区登记。
export async function checkSourceLayout(root) {
  const errors = [];
  const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  if (!manifest.packageManager?.startsWith("pnpm@"))
    errors.push("root packageManager must be pnpm@<version>");
  if (!(await exists(join(root, "pnpm-lock.yaml")))) errors.push("missing pnpm-lock.yaml");
  if (!(await exists(join(root, "pnpm-workspace.yaml"))))
    errors.push("missing pnpm-workspace.yaml");
  if (manifest.workspaces)
    errors.push("root package.json must not declare workspaces; use pnpm-workspace.yaml");
  let workspacePackagePatterns = [];
  try {
    const workspaceConfig = parseYaml(await readFile(join(root, "pnpm-workspace.yaml"), "utf8"));
    workspacePackagePatterns = Array.isArray(workspaceConfig?.packages)
      ? workspaceConfig.packages
      : [];
  } catch (error) {
    errors.push(
      `invalid pnpm-workspace.yaml: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  for (const pattern of workspacePatterns) {
    if (!workspacePackagePatterns.includes(pattern))
      errors.push(`pnpm-workspace.yaml must register ${pattern}`);
  }
  const packages = await readSourcePackages(root, {
    onMissing: (directory) => errors.push(`missing source root: ${directory}`),
  });
  const names = new Map();
  for (const pkg of packages) {
    const name = pkg.manifest.name;
    if (name === "@kayingcode/cua") errors.push(`${pkg.file}: retired package @kayingcode/cua`);
    if (!name) errors.push(`${pkg.file}: missing package name`);
    else if (names.has(name))
      errors.push(`${pkg.file}: duplicate package name ${name} (${names.get(name)})`);
    else names.set(name, pkg.file);
    if (pkg.manifest.packageManager)
      errors.push(`${pkg.file}: only the root declares packageManager`);
    if (pkg.manifest.workspaces) errors.push(`${pkg.file}: nested workspaces are forbidden`);
  }
  for (const pkg of [{ file: "package.json", manifest }, ...packages]) {
    for (const field of dependencyFields) {
      for (const [name, version] of Object.entries(pkg.manifest[field] ?? {})) {
        if (name === "@kayingcode/cua")
          errors.push(`${pkg.file}: retired dependency @kayingcode/cua`);
        if (version.startsWith("workspace:") && !names.has(name))
          errors.push(`${pkg.file}: unknown workspace dependency ${name}`);
      }
    }
  }
  // 检查清单而不是目录存在性：旧路径可能只有忽略的构建缓存，不属于可编辑源码。
  for (const file of [
    "packages/kayingcode-cua/package.json",
    "packages/kayingcode-server-cli/package.json",
    "apps/kayingcode-mobile/package.json",
    "site/package.json",
  ]) {
    if (await exists(join(root, file))) errors.push(`obsolete source/workspace entry: ${file}`);
  }
  if (await exists(join(root, "turbo.json"))) {
    const turbo = JSON.parse(await readFile(join(root, "turbo.json"), "utf8"));
    for (const [task, definition] of Object.entries(turbo.tasks ?? {})) {
      if (definition.inputs?.some((input) => input.includes("bun.lock")))
        errors.push(`turbo.json ${task}: stale bun.lock input; use pnpm-lock.yaml`);
    }
  }
  return { errors, packages: packages.length };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await checkSourceLayout(resolve(fileURLToPath(new URL("..", import.meta.url))));
  if (result.errors.length) {
    process.stderr.write(`${result.errors.join("\n")}\n`);
    process.exitCode = 1;
  } else process.stdout.write(`source layout: OK (${result.packages} pnpm workspace packages)\n`);
}
