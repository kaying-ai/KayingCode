/**
 * 官方插件 filesystem seed 的顶层白名单与 requiredSeedPaths 校验工具。
 *
 * 为什么会拆出来：includedTopLevelPaths 与 requiredSeedPaths 是两张手工同步的清单。
 * 曾发生过 agents/scripts 漏出白名单被静默裁掉；又发生过
 * THIRD_PARTY_NOTICES.md 在 requiredSeedPaths 里、却不在白名单里，
 * 收集阶段直接丢文件 → 校验永远报 missing → 拒绝写 cache →
 * 市场 listing 仍可见但详情页 describe 报「组件清单加载失败」。
 * 因此 requiredSeedPaths 的顶层段必须自动并入白名单，不能再靠人眼对齐。
 */

/** 允许 seed 收集的顶层文件/目录名。 */
export const includedTopLevelPaths: ReadonlySet<string> = new Set([
  ".mcp.json",
  ".kayingcode-plugin",
  "README.md",
  // 官方内容插件新增 agents 后，filesystem seed 的顶层白名单未同步，目录被静默裁掉。
  "agents",
  "commands",
  "dist",
  "docs",
  "hooks",
  "output-styles",
  "package.json",
  // Browser skill 会从官方插件根目录动态导入 scripts/browser-client.mjs。
  // filesystem seed 若漏掉 scripts，Dev 会连接 node_repl 成功却在首次 Browser Use 时导入失败。
  "scripts",
  "skills",
  "templates",
  // 许可证声明文件；曾因不在白名单被裁掉，导致 TapTap Maker seed 永久失败。
  "THIRD_PARTY_NOTICES.md",
  "NOTICE.md",
  "LICENSE",
  "LICENSE.md",
]);

export interface SeedPathDefinition {
  requiredSeedPaths?: readonly string[];
  runtimeTopLevelPaths?: readonly string[];
}

function topLevelSegment(relativePath: string): string {
  return relativePath.split("/")[0] ?? "";
}

/**
 * 组装本次 seed 的顶层白名单：
 * 基础集 ∪ definition.runtimeTopLevelPaths ∪ requiredSeedPaths 的顶层段。
 * required 自动进白名单，保证「声明必含」的文件不会被收集阶段静默丢掉。
 */
export function buildSeedAllowedTopLevelPaths(definition: SeedPathDefinition): Set<string> {
  const allowed = new Set(includedTopLevelPaths);
  for (const path of definition.runtimeTopLevelPaths ?? []) {
    const topLevel = topLevelSegment(path);
    if (topLevel) allowed.add(topLevel);
  }
  for (const path of definition.requiredSeedPaths ?? []) {
    const topLevel = topLevelSegment(path);
    if (topLevel) allowed.add(topLevel);
  }
  return allowed;
}

export function shouldIncludePluginFile(
  relativePath: string,
  allowedTopLevelPaths: ReadonlySet<string>,
): boolean {
  const segments = relativePath.split("/");
  if (segments.includes(".DS_Store") || segments.some((segment) => segment.endsWith(".pyc"))) {
    return false;
  }
  const [topLevel] = relativePath.split("/");
  return topLevel !== undefined && allowedTopLevelPaths.has(topLevel);
}

export function findMissingOfficialPluginSeedPaths(
  definition: Pick<SeedPathDefinition, "requiredSeedPaths">,
  files: ReadonlyArray<{ path: string }>,
): string[] {
  const availablePaths = new Set(files.map((file) => file.path));
  return (definition.requiredSeedPaths ?? []).filter(
    (requiredPath) => !availablePaths.has(requiredPath),
  );
}
