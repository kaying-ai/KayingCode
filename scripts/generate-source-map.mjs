import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { format } from "oxfmt";
import { readSourcePackages } from "./check-source-layout.mjs";
import { loadOfficialPluginCatalog } from "./official-plugin-catalog.mjs";

const fields = ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"];
function cell(value) {
  // Bug 原因：同一表格行出现两个未转义的 `*`（如 ./remote/*.js 与 ./source-server/*.js）时，
  // oxfmt 的 Markdown 格式化会把它们当成强调并改写成 `_`，生成物中的通配导出因此失真。
  // 先转义星号，保证 export 字面量在生成文件里保持可读。
  return String(value).replace(/\|/g, "\\|").replace(/\*/g, "\\*").replace(/\r?\n/g, " ");
}

export async function generateSourceMap(root, { check = false } = {}) {
  const packages = await readSourcePackages(root);
  const names = new Set(packages.map(({ manifest }) => manifest.name));
  const policy = parse(await readFile(resolve(root, "architecture-policy.yaml"), "utf8"));
  const catalog = await loadOfficialPluginCatalog(root);
  const releases = new Map(catalog.plugins.map((plugin) => [plugin.sourceRoot, plugin]));
  const lines = [
    "# 当前源码包地图",
    "",
    "> 由 `pnpm run source:map` 从一级 package.json、architecture-policy.yaml 与统一插件发行清单生成，请勿手工编辑。",
    "",
    `当前共 ${packages.length} 个 pnpm 工作区包；Dart/Flutter 应用不计入这个数量。职责与落点约定见 [AGENTS.md](AGENTS.md) 和 [apps/README.md](apps/README.md)。`,
    "",
    "登记来源是 pnpm-workspace.yaml。下列入口是清单声明，dist 入口须先构建才存在；没有 exports 的包不因此成为可跨包引用的库。验证栏只列包清单真实提供的命令，不表示覆盖全部验收场景。",
    "",
  ];
  for (const category of ["apps", "packages", "plugins", "tools"]) {
    lines.push(
      `## ${category}`,
      "",
      "| 源码目录 | 包名 / 版本 | 公开入口（清单） | 内部依赖 | 验证命令 | 架构模块 |",
      "| --- | --- | --- | --- | --- | --- |",
    );
    for (const pkg of packages.filter(({ file }) => file.startsWith(`${category}/`))) {
      const directory = pkg.file.slice(0, -"/package.json".length);
      const manifest = pkg.manifest;
      const exports = manifest.exports
        ? typeof manifest.exports === "string"
          ? manifest.exports
          : Object.keys(manifest.exports).join(", ")
        : [manifest.main, manifest.module, manifest.types].filter(Boolean).join(", ") || "—";
      const dependencies = [
        ...new Set(
          fields.flatMap((field) =>
            Object.keys(manifest[field] ?? {}).filter((name) => names.has(name)),
          ),
        ),
      ].sort();
      const commands = Object.keys(manifest.scripts ?? {}).filter((name) =>
        /^(test|typecheck|lint|fmt|verify|check)(:|$)/.test(name),
      );
      const modules = policy.modules
        .filter((module) =>
          module.roots.some((path) => path === directory || path.startsWith(`${directory}/`)),
        )
        .map(({ id, managed }) => `${id}${managed ? "（受治理）" : "（legacy）"}`);
      lines.push(
        `| [${directory}](${pkg.file}) | ${cell(manifest.name)} / ${cell(manifest.version ?? "—")} | ${cell(exports)} | ${cell(dependencies.join(", ") || "—")} | ${cell(commands.join(", ") || "—")} | ${cell(modules.join(", ") || "—")} |`,
      );
    }
    lines.push("");
  }
  lines.push(
    "## 插件发行映射",
    "",
    "config/official-plugins.json 是唯一发行登记；版本与 npm 包名取自插件当前 manifest。stagedPath 为稳定制品布局，不是可编辑源码目录。兼容占位定义不进入发行集合。",
    "",
    "| 源码 | npm 包名 | 插件名 / 版本 | 制品目录 | 交付形态 | 默认启用 |",
    "| --- | --- | --- | --- | --- | --- |",
  );
  for (const [sourceRoot, plugin] of releases)
    lines.push(
      `| ${sourceRoot} | ${plugin.packageName} | ${plugin.name} / ${plugin.version} | ${plugin.stagedPath} | ${plugin.deliveryKind} | ${plugin.defaultEnabled === true ? "是" : "否"} |`,
    );
  lines.push(
    "",
    `仅保留兼容定义：${catalog.compatibilityDefinitions.map(({ name }) => name).join(", ") || "无"}。node-repl-host 是隐藏宿主包，未提供商店 listing。`,
    "",
    "## 维护",
    "",
    "1. 新增、移动或移除包时，先更新 spec，再修改目录、根工作区与架构策略；跨包导入使用公开入口。",
    "2. 官方插件在 config/official-plugins.json 登记，构建脚本须存在于自身 package.json；保留稳定 stagedPath 与插件 ID。",
    "3. 运行 `pnpm run source:plugins` 与 `pnpm run source:map` 更新生成文件，再运行 `pnpm run source:check`。",
    "4. 代码改动执行 `pnpm run typecheck`、`pnpm run lint`、`pnpm run architecture:check --changed` 及目标包实际提供的测试。",
    "",
  );
  const formatting = JSON.parse(await readFile(resolve(root, ".oxfmtrc.json"), "utf8"));
  const formatted = await format("SOURCE_PACKAGES.md", lines.join("\n"), formatting);
  if (formatted.errors.length) throw new Error("Unable to format generated source package map");
  const text = formatted.code.replace(/\r\n/g, "\n");
  const path = resolve(root, "SOURCE_PACKAGES.md");
  if (check) {
    const existing = await readFile(path, "utf8").catch((error) => {
      if (error.code === "ENOENT") return "";
      throw error;
    });
    if (existing.replace(/\r\n/g, "\n") !== text)
      throw new Error("Source package map is stale; run pnpm run source:map");
  } else await writeFile(path, text);
  return packages.length;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const count = await generateSourceMap(fileURLToPath(new URL("..", import.meta.url)), {
    check: process.argv.includes("--check"),
  });
  process.stdout.write(`source package map: OK (${count} packages)\n`);
}
