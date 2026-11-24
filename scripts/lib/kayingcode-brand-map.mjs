/**
 * 上游 ZCode → 产品 KayingCode 品牌机械映射的唯一来源。
 *
 * 顺序敏感：先处理包作用域与驼峰品牌，再处理全小写标识和点路径。
 * 协议生成、盘点脚本与 rename-kayingcode 必须共用这里，避免多份映射漂移。
 */
export const BRAND_REPLACEMENTS = Object.freeze([
  [/ZCode/g, "KayingCode"],
  // zcode 不会命中 kayingcode（无 z 子串），可安全全局替换
  [/zcode/g, "kayingcode"],
  [/ZCODE_/g, "KAYINGCODE_"],
  [/\.zcode/g, ".kayingcode"],
  [/dev\.zcode/g, "dev.kayingcode"],
  [/com\.zhipu\.zcode/g, "dev.kayingcode"],
]);

/**
 * 产品保留上游 workspace 包作用域与包名（如 @zcode/shared、@zcode/zcode-cua），
 * 不能被全局 zcode 替换误伤；替换前把包说明符整体占位，最后恢复。
 */
const PACKAGE_SPECIFIER = /@zcode\/[A-Za-z0-9._-]+/g;
const PACKAGE_TOKEN = /@__kc_pkg_(\d+)__/g;

/** 对文本应用品牌映射；用于源码内容与路径。 */
export function applyBrandMap(text) {
  const packages = [];
  let result = text.replace(PACKAGE_SPECIFIER, (match) => {
    const token = `@__kc_pkg_${packages.length}__`;
    packages.push(match);
    return token;
  });
  for (const [pattern, replacement] of BRAND_REPLACEMENTS) {
    result = result.replace(pattern, replacement);
  }
  return result.replace(PACKAGE_TOKEN, (_match, index) => packages[Number(index)]);
}

/**
 * 上游协议路径 → 产品协议路径（如 zcode-protocol → kayingcode-protocol）。
 * `apps/zcode-cli` 是产品保留的目录名，只映射其余路径段。
 */
export function mapProtocolPath(path) {
  return path
    .split("/")
    .map((segment) => (segment === "zcode-cli" ? segment : applyBrandMap(segment)))
    .join("/");
}
