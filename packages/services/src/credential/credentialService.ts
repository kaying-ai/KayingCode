import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { atomicWritePrivateTextFile, backupCorruptFile, withFileLock } from "@zcode/shared/node";
import {
  credentialKeySchema,
  credentialRecordSchema,
  credentialValueSchema,
  formatZodError,
} from "@zcode/shared";
import { migrateCredentialRecord, type CredentialCipher } from "@zcode/shared/credential-security";
import type { ICredentialService } from "./credential.js";
import {
  createCredentialCipherProvider,
  type CredentialCipherProvider,
} from "./providers/credentialCipherProvider.js";
import { createServiceLogger } from "../logger/serviceLogger.js";
import { getAppConfigDir } from "../paths.js";

/**
 * 凭据存储路径
 *
 * 当前持久化格式仍是 JSON；v2 密文由 OS 钥匙串托管的随机密钥保护，
 * 读取旧 enc:v1 值时在文件锁内整库迁移。路径按每次操作解析，数据根切换后
 * 新路径会使用自己的 cipher / keyring 条目。
 */
const logger = createServiceLogger("credentialService");

function getCredentialsDir() {
  return getAppConfigDir();
}

function getCredentialsFile() {
  return join(getCredentialsDir(), "credentials.json");
}

function getErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return undefined;
  }
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

async function readAll(credentialsFile = getCredentialsFile()): Promise<Record<string, string>> {
  let raw: string;
  try {
    raw = await readFile(credentialsFile, "utf-8");
  } catch (error) {
    if (getErrorCode(error) === "ENOENT") {
      return {};
    }
    throw new Error(`Unable to read KayingCode credentials: ${credentialsFile}`, { cause: error });
  }

  try {
    const rawValue = JSON.parse(raw);
    const result = credentialRecordSchema.safeParse(rawValue);
    if (!result.success) {
      throw new Error(formatZodError(result.error));
    }
    return result.data;
  } catch (error) {
    // 把损坏 JSON/schema 当成空 store 后继续 save 会清空其他 OAuth 与登录凭据。
    // 保留损坏文件证据并向上传递错误，禁止自动覆盖。
    const backupPath = await backupCorruptFile(credentialsFile).catch(() => undefined);
    // 服务层日志必须统一经过分级 logger，确保生产环境的损坏凭据告警
    // 进入相同的落盘/采集策略，同时不记录凭据内容。
    logger.warn(undefined, "read failed; refusing to overwrite corrupt credential store", {
      backupPath,
      credentialsFile,
    });
    throw new Error(`KayingCode credentials are corrupt: ${credentialsFile}`, { cause: error });
  }
}

async function writeAll(credentialsFile: string, data: Record<string, string>): Promise<void> {
  // 凭据路径之前在模块加载时就绑定到 homedir()，
  // Windows 测试里即使切换 HOME 也会继续写真实用户目录，导致隔离失效。
  await atomicWritePrivateTextFile(credentialsFile, `${JSON.stringify(data, null, 2)}\n`);
}

interface CredentialServiceDependencies {
  cipherProvider?: CredentialCipher;
  /** Host 私有的持久化成功通知；不进入 Renderer/RPC 凭据接口。 */
  onDidMutate?: (event: { operation: "save" | "delete"; key: string }) => void;
}

export function createCredentialService(
  dependencies: CredentialServiceDependencies = {},
): ICredentialService {
  // Desktop Main/Host 会注入系统 cipher；未注入的独立 Server 在 PR2 前保持 v1 兼容，
  // 避免无 Secret Service 的远端因为本机 PR1 改动而无法启动。
  const fallbackCipher: CredentialCipherProvider = createCredentialCipherProvider();
  const cipherFor = (_credentialsFile: string): CredentialCipher =>
    dependencies.cipherProvider ?? fallbackCipher;

  const migrateIfNeeded = async (
    credentialsFile: string,
    raw: Record<string, string>,
    cipher: CredentialCipher,
  ): Promise<Record<string, string>> => {
    if (!Object.values(raw).some((value) => cipher.needsMigration?.(value))) return raw;
    return withFileLock(credentialsFile, async () => {
      const locked = await readAll(credentialsFile);
      const currentCipher = cipherFor(credentialsFile);
      const migrated = await migrateCredentialRecord(locked, currentCipher);
      if (migrated) await writeAll(credentialsFile, migrated);
      return migrated ?? locked;
    });
  };

  return {
    async load(key: string): Promise<string | null> {
      const validatedKey = credentialKeySchema.parse(key);
      const credentialsFile = getCredentialsFile();
      const cipher = cipherFor(credentialsFile);
      const creds = await migrateIfNeeded(credentialsFile, await readAll(credentialsFile), cipher);
      const rawValue = creds[validatedKey];
      if (rawValue === undefined) {
        return null;
      }

      return cipher.decrypt(rawValue);
    },

    async save(key: string, value: string): Promise<void> {
      const validatedKey = credentialKeySchema.parse(key);
      const validatedValue = credentialValueSchema.parse(value);
      const credentialsFile = getCredentialsFile();
      const cipher = cipherFor(credentialsFile);
      const encryptedValue = await cipher.encrypt(validatedValue);
      // desktop host 与 CLI adapter 是独立进程，进程内排队不能阻止 whole-file
      // read-modify-write 丢更新；共享目录锁必须覆盖读取、变更和原子替换全过程。
      await withFileLock(credentialsFile, async () => {
        const creds = await readAll(credentialsFile);
        const migrated = await migrateCredentialRecord(creds, cipher);
        const next = migrated ?? creds;
        next[validatedKey] = encryptedValue;
        await writeAll(credentialsFile, next);
      });
      dependencies.onDidMutate?.({ operation: "save", key: validatedKey });
    },

    async delete(key: string): Promise<void> {
      const validatedKey = credentialKeySchema.parse(key);
      const credentialsFile = getCredentialsFile();
      await withFileLock(credentialsFile, async () => {
        const creds = await readAll(credentialsFile);
        delete creds[validatedKey];
        await writeAll(credentialsFile, creds);
      });
      dependencies.onDidMutate?.({ operation: "delete", key: validatedKey });
    },
  };
}
