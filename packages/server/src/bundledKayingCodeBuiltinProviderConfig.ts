import { materializeKayingCodeBuiltinProviderConfig } from "@zcode/services/node";

declare const __KAYINGCODE_BUILTIN_PROVIDER_CONFIG_JSON__: string | undefined;

interface MaterializeBundledKayingCodeBuiltinProviderConfigOptions {
  readonly environmentConfigRoot: string;
  readonly content: string;
}

/** 返回构建时嵌入远端 Server 的 KayingCode Built-in Provider Config。 */
export function readBundledKayingCodeBuiltinProviderConfig(): string {
  if (typeof __KAYINGCODE_BUILTIN_PROVIDER_CONFIG_JSON__ !== "string") {
    throw new Error("当前构建未嵌入 KayingCode Built-in Provider Config");
  }
  return __KAYINGCODE_BUILTIN_PROVIDER_CONFIG_JSON__;
}

/**
 * 将 KayingCode Built-in Config 原子物化到所属环境的固定资源副本。
 * 升级前退出旧进程；不保留按内容 hash 增长的历史文件。
 */
export async function materializeBundledKayingCodeBuiltinProviderConfig(
  options: MaterializeBundledKayingCodeBuiltinProviderConfigOptions,
): Promise<string> {
  return materializeKayingCodeBuiltinProviderConfig(options);
}
