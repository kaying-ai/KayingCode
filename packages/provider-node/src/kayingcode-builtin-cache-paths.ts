import { createHash } from "node:crypto";
import { join } from "node:path";

export function resolveKayingCodeBuiltinClientPlatform(): string {
  const target = process.platform === "win32" ? "windows" : process.platform;
  const arch =
    process.arch === "arm64" ? "aarch64" : process.arch === "x64" ? "x86_64" : process.arch;
  return `${target}-${arch}`;
}

export interface KayingCodeBuiltinCachePathOptions {
  readonly environmentConfigRoot: string;
  readonly platform: string;
  readonly appVersion: string;
  readonly kayingcodeEndpointOrigin: string;
}

export interface KayingCodeBuiltinCachePaths {
  readonly activeFilePath: string;
  readonly controlFilePath: string;
}

/** 按平台与 App 版本隔离 Active/LKG；路径本身就是兼容范围。 */
export function resolveKayingCodeBuiltinCachePaths(
  options: KayingCodeBuiltinCachePathOptions,
): KayingCodeBuiltinCachePaths {
  const platform = normalizeSegment(options.platform, "platform");
  const appVersion = normalizeSegment(options.appVersion, "appVersion");
  const endpointKey = createKayingCodeBuiltinEndpointKey(options.kayingcodeEndpointOrigin);
  const directory = join(
    options.environmentConfigRoot,
    "runtime",
    "provider",
    platform,
    appVersion,
    endpointKey,
  );
  return {
    activeFilePath: join(directory, "kayingcode-builtin.json"),
    controlFilePath: join(directory, "kayingcode-builtin-refresh.json"),
  };
}

/** 将 KayingCode 控制面 Origin 规范化后映射为安全、稳定且碰撞风险可忽略的缓存路径段。 */
export function createKayingCodeBuiltinEndpointKey(kayingcodeEndpointOrigin: string): string {
  const normalized = normalizeKayingCodeBuiltinEndpointOrigin(kayingcodeEndpointOrigin);
  const digest = createHash("sha256").update(normalized).digest("hex").slice(0, 32);
  return `endpoint-${digest}`;
}

/**
 * KayingCode.localrun：无官方控制面 Endpoint。
 * 空 origin / 本地哨兵统一映射为 `local://kayingcode-builtin`，保证缓存路径稳定且不抛错；
 * 自定义模型仅依赖 bundled + Personal 配置，不拉远端 Built-in CDN。
 */
export const KAYINGCODE_BUILTIN_LOCAL_ENDPOINT = "local://kayingcode-builtin";

export function normalizeKayingCodeBuiltinEndpointOrigin(value: string): string {
  const normalized = value.trim();
  if (!normalized) return KAYINGCODE_BUILTIN_LOCAL_ENDPOINT;
  // 已是本地哨兵时必须原样返回：createKayingCodeBuiltinEndpointKey 会二次 normalize，
  // 若再走 new URL() 会因协议不是 HTTP(S) 抛错，拖垮整个 Provider 配置加载。
  if (normalized === KAYINGCODE_BUILTIN_LOCAL_ENDPOINT || normalized.startsWith("local://")) {
    return KAYINGCODE_BUILTIN_LOCAL_ENDPOINT;
  }
  const url = new URL(normalized);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("KayingCode Built-in Endpoint Origin 只支持 HTTP(S)");
  }
  return url.origin;
}

/** 是否配置了真实（非本地哨兵）的控制面 Endpoint。 */
export function hasKayingCodeBuiltinRemoteEndpoint(kayingcodeEndpointOrigin: string): boolean {
  return (
    normalizeKayingCodeBuiltinEndpointOrigin(kayingcodeEndpointOrigin) !==
    KAYINGCODE_BUILTIN_LOCAL_ENDPOINT
  );
}

function normalizeSegment(value: string, name: string): string {
  const normalized = value.trim();
  if (!normalized || normalized === "." || normalized === ".." || /[\\/]/u.test(normalized)) {
    throw new Error(`KayingCode Built-in ${name} 不是合法路径段`);
  }
  return normalized;
}
