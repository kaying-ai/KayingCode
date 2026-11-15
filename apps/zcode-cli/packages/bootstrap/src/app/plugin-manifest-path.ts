import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * 内置插件清单目录的读取顺序与 CLI/extension-host 一致：上游 `.zcode-plugin` 优先，
 * `.kayingcode-plugin` 只作为旧缓存和第三方插件的兼容回退。
 */
export const PLUGIN_MANIFEST_RELATIVE_PATHS = [
  ".zcode-plugin/plugin.json",
  ".kayingcode-plugin/plugin.json",
] as const;

export type PluginManifestRelativePath = (typeof PLUGIN_MANIFEST_RELATIVE_PATHS)[number];

export function isPluginManifestRelativePath(path: string): path is PluginManifestRelativePath {
  return (PLUGIN_MANIFEST_RELATIVE_PATHS as readonly string[]).includes(path);
}

/** 返回已存在的清单路径；都不存在时返回规范位置，交由调用方按原有错误语义处理。 */
export function resolvePluginManifestPath(rootPath: string): string {
  for (const relativePath of PLUGIN_MANIFEST_RELATIVE_PATHS) {
    const candidate = join(rootPath, ...relativePath.split("/"));
    if (existsSync(candidate)) return candidate;
  }
  return join(rootPath, ...PLUGIN_MANIFEST_RELATIVE_PATHS[0].split("/"));
}
