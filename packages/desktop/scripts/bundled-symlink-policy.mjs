import { existsSync, readdirSync, readlinkSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

/**
 * 扫描 .app bundle 内对 codesign 深度校验非法的符号链接：
 * - 目标是绝对路径（指向打包机文件系统）；
 * - 相对目标解析后逃出 bundle 根；
 * - 悬空链接（目标不存在）。
 * codesign --verify --deep --strict 对前两类直接报
 * "invalid destination for symbolic link in bundle"，报错本身不指出具体文件，
 * 打包阶段必须先行拦截并给出精确路径。
 */
export function findInvalidBundledSymlinks(appRoot) {
  const invalid = [];
  const walk = (directory) => {
    let entries;
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        const target = readlinkSync(fullPath);
        const resolvedTarget = isAbsolute(target) ? target : resolve(dirname(fullPath), target);
        const relativeToAppRoot = relative(appRoot, resolvedTarget);
        if (isAbsolute(target)) {
          invalid.push({ path: fullPath, target, reason: "absolute" });
        } else if (relativeToAppRoot.startsWith("..")) {
          invalid.push({ path: fullPath, target, reason: "escapes-bundle" });
        } else if (!existsSync(fullPath)) {
          invalid.push({ path: fullPath, target, reason: "dangling" });
        }
      }
      // statSync 不跟随符号链接的目录条目本身不会出现（isDirectory 已排除 symlink），
      // 但目录内可能还有嵌套内容，继续下探。
      if (entry.isDirectory()) {
        walk(fullPath);
      }
    }
  };

  if (!existsSync(appRoot) || !statSync(appRoot).isDirectory()) {
    throw new Error(`待检查的 app bundle 不存在: ${appRoot}`);
  }
  walk(appRoot);
  return invalid;
}

/**
 * afterPack 的 fail-closed 断言：bundle 内存在非法符号链接时直接失败，
 * 避免把问题拖到签名阶段才暴露出一条没有文件线索的 codesign 报错。
 */
export function assertNoInvalidBundledSymlinks(appRoot) {
  const invalid = findInvalidBundledSymlinks(appRoot);
  if (invalid.length === 0) {
    return;
  }
  const details = invalid
    .map((entry) => `- [${entry.reason}] ${relative(appRoot, entry.path)} -> ${entry.target}`)
    .join("\n");
  throw new Error(
    `打包产物包含非法符号链接（绝对路径 / 逃出 bundle / 悬空），将导致 macOS 签名失败:\n${details}\n` +
      "请检查插件 staging 白名单与源码树中的构建残留（如 .build 目录）。",
  );
}
