import path from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE_PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export type MakerEnvironment = "rnd" | "production";

export function getKayingForTaptapPackageRoot(): string {
  // Host 注入的 plugin root 是安装/SEA 缓存中的权威根；开发态才回退当前源码包。
  return process.env.KAYINGCODE_PLUGIN_ROOT || SOURCE_PACKAGE_ROOT;
}

export function getVendorRoot(): string {
  return path.join(getKayingForTaptapPackageRoot(), "vendor", "instant-games-open-mcp");
}

export function getVendorDistPath(fileName: "maker.js" | "server.js" | "proxy.js"): string {
  return path.join(getVendorRoot(), "dist", fileName);
}

export function getKayingForTaptapDataRoot(): string {
  // 修复依据：旧实现把授权状态写进另一个产品的 ~/.KayingCodex，导致两个应用
  // 共享凭据且卸载插件后残留。官方插件 Host 已提供隔离后的 data root，统一以它为所有者。
  return process.env.KAYINGCODE_PLUGIN_DATA || path.join(getKayingForTaptapPackageRoot(), ".data");
}

export function getMakerHome(): string {
  return process.env.TAPTAP_MAKER_HOME || path.join(getKayingForTaptapDataRoot(), "taptap-maker");
}

export function getNodeCommand(): string {
  if ((process.versions as NodeJS.ProcessVersions & { bun?: string }).bun) {
    return process.env.KAYING_FOR_TAPTAP_NODE || process.env.NODE || "node";
  }
  return process.execPath;
}

const CHILD_ENV_ALLOWLIST = new Set([
  "APPDATA",
  "CI",
  "COMSPEC",
  "HOME",
  "HTTPS_PROXY",
  "HTTP_PROXY",
  "LANG",
  "KAYINGCODE_PLUGIN_DATA",
  "KAYINGCODE_PLUGIN_ROOT",
  "LC_ALL",
  "LOCALAPPDATA",
  "NODE_EXTRA_CA_CERTS",
  "NO_PROXY",
  "PATH",
  "PATHEXT",
  "Path",
  "SSL_CERT_FILE",
  "SystemRoot",
  "TEMP",
  "TERM",
  "TMP",
  "TMPDIR",
  "USERPROFILE",
  "WINDIR",
]);

/** Build the least-privilege environment shared by Maker and the native core. */
export function createPluginChildEnvironment(extra?: NodeJS.ProcessEnv): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (
      value !== undefined &&
      (CHILD_ENV_ALLOWLIST.has(key) ||
        key.startsWith("KAYING_FOR_TAPTAP_") ||
        key.startsWith("TAPTAP_"))
    ) {
      env[key] = value;
    }
  }
  for (const [key, value] of Object.entries(extra ?? {})) {
    if (value !== undefined) env[key] = value;
  }
  return env;
}
