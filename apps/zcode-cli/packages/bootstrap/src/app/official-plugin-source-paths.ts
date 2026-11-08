import { existsSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

export function resolveDevelopmentPluginBase(
  entryDirectory: string | undefined,
): string | undefined {
  if (!entryDirectory) return undefined;
  // CLI 迁入 apps 后，入口相对路径与任意工作区 cwd 都到不了 plugins/。
  // 只识别已知开发入口并校验仓库标记，统一补源码根，避免新增插件静默漏播种。
  for (const depth of [3, 5]) {
    const root = resolve(entryDirectory, ...Array<string>(depth).fill(".."));
    const parts = relative(root, entryDirectory).split(sep);
    const cli = parts.join("/") === "apps/zcode-cli/packages/cli/dist";
    const staged =
      parts.length === 5 &&
      parts[0] === "apps" &&
      parts[1] === "kayingcode-desktop" &&
      parts[2] === "bundled-agents" &&
      /^(?:darwin|win32|linux)-(?:arm64|x64)$/.test(parts[3]!) &&
      parts[4] === "glm";
    if (
      (cli || staged) &&
      existsSync(join(root, "config/official-plugins.json")) &&
      existsSync(join(root, "apps/zcode-cli/packages/cli/package.json"))
    )
      return root;
  }
  return undefined;
}
