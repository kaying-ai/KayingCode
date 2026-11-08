import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * 读取已验收的官方 ZCode 上游基线版本（UPSTREAM_BASE.json）。
 * 该版本与 KayingCode 产品版本相互独立；文件缺失或格式异常时返回 "unknown"，
 * 避免构建配置因元数据问题直接失败。
 */
export function readUpstreamBaseVersion(repoRoot) {
  try {
    const parsed = JSON.parse(readFileSync(resolve(repoRoot, "UPSTREAM_BASE.json"), "utf8"));
    const version = typeof parsed?.version === "string" ? parsed.version.trim() : "";
    return version || "unknown";
  } catch {
    return "unknown";
  }
}
