export const KAYINGCODE_BUILTIN_PROVIDER_CONFIG_FILE_ENV = "KAYINGCODE_BUILTIN_PROVIDER_CONFIG_FILE";
export const KAYINGCODE_BUILTIN_PROVIDER_BUNDLED_CONFIG_FILE_ENV =
  "KAYINGCODE_BUILTIN_PROVIDER_BUNDLED_CONFIG_FILE";
export const KAYINGCODE_PERSONAL_PROVIDER_CONFIG_FILE_ENV = "KAYINGCODE_PERSONAL_PROVIDER_CONFIG_FILE";
export const PERSONAL_PROVIDER_CONFIG_FILE_NAME = "provider_config.json";

export interface NodeProviderRuntimePaths {
  readonly kayingcodeBuiltinFilePath: string;
  readonly personalFilePath: string;
}

export function createNodeProviderRuntimePathEnv(
  paths: NodeProviderRuntimePaths,
): Record<string, string> {
  return {
    [KAYINGCODE_BUILTIN_PROVIDER_CONFIG_FILE_ENV]: paths.kayingcodeBuiltinFilePath,
    [KAYINGCODE_PERSONAL_PROVIDER_CONFIG_FILE_ENV]: paths.personalFilePath,
  };
}

export function resolveNodeProviderRuntimePaths(
  env: Readonly<Record<string, string | undefined>>,
): NodeProviderRuntimePaths | null {
  const kayingcodeBuiltinFilePath = env[KAYINGCODE_BUILTIN_PROVIDER_CONFIG_FILE_ENV]?.trim();
  const personalFilePath = env[KAYINGCODE_PERSONAL_PROVIDER_CONFIG_FILE_ENV]?.trim();
  if (!kayingcodeBuiltinFilePath && !personalFilePath) return null;
  if (!kayingcodeBuiltinFilePath || !personalFilePath) {
    throw new Error("KayingCode Built-in 与 Personal Provider Config 路径必须同时提供");
  }
  return Object.freeze({ kayingcodeBuiltinFilePath, personalFilePath });
}
