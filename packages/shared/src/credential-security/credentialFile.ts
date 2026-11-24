import { isAbsolute } from "node:path";

/**
 * 进程装配：Source Server Core 使用自有凭据库时写入凭据文件的绝对路径，Core 拉起的 Agent 继承。
 * 不是用户配置；Desktop 不设置。
 */
export const KAYINGCODE_CREDENTIALS_FILE_ENV = "KAYINGCODE_CREDENTIALS_FILE";

/** 读取进程装配的凭据文件；空值视为未设置，非绝对路径直接失败，不按 cwd 解析。 */
export function readAssignedCredentialsFile(
  env: Readonly<Record<string, string | undefined>>,
): string | undefined {
  const value = env[KAYINGCODE_CREDENTIALS_FILE_ENV]?.trim();
  if (!value) return undefined;
  if (!isAbsolute(value)) {
    throw new Error(`${KAYINGCODE_CREDENTIALS_FILE_ENV} must be an absolute file path`);
  }
  return value;
}
