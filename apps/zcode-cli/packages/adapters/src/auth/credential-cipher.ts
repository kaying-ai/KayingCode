import {
  createLegacyCredentialCipher,
  type CredentialCipher,
} from "@zcode/shared/credential-security";

export type KayingCodeCredentialCipher = CredentialCipher;
export interface KayingCodeCredentialCipherOptions {
  env?: Record<string, string | undefined>;
}
/** 仅兼容旧格式；正式凭据仓库默认使用系统安全存储。 */
export function createKayingCodeCredentialCipher(
  options: KayingCodeCredentialCipherOptions = {},
): KayingCodeCredentialCipher {
  return createLegacyCredentialCipher(options.env);
}

/** 任何 `enc:` 前缀都必须经 cipher 解析，未知格式不能作为明文继续流转。 */
export function isEncryptedKayingCodeCredentialValue(value: string): boolean {
  return value.startsWith("enc:");
}
