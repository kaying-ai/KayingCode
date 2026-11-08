import type { ProviderFamilyDomain } from "@zcode/shared";
import type { AccountProviderCredentialStore } from "./accountProviderCredentialStore.js";
import { accountProviderCredentialKey } from "./accountProviderCredentialKey.js";

interface AccountProviderCredentialServiceOptions {
  readonly credentialStore: Pick<
    AccountProviderCredentialStore,
    "loadApiKey" | "saveApiKey" | "deleteApiKey"
  >;
  /** 已移除 OAuth；保留字段形状以便旧装配点不改接口。 */
  readonly loadOAuthAccessToken?: (family: ProviderFamilyDomain) => Promise<string | null>;
  /** 已移除官方 API Key 远端解析。 */
  readonly resolveProviderApiKey?: (
    family: ProviderFamilyDomain,
    accessToken: string,
  ) => Promise<string | null>;
}

interface LoadCodingPlanApiKeyInput {
  readonly providerId: string;
  readonly family: ProviderFamilyDomain;
  readonly accountIdentity: string;
  readonly forceRefresh?: boolean;
}

interface AccountProviderCredentialService {
  loadCodingPlanApiKey(input: LoadCodingPlanApiKeyInput): Promise<string | null>;
}

/**
 * KayingCode.localrun：无账号体系，不自动获取项目 API Key。
 * 仅允许读取本地已缓存的账号级 key；不再访问 OAuth 或官方 Key 服务。
 */
export function createAccountProviderCredentialService(
  options: AccountProviderCredentialServiceOptions,
): AccountProviderCredentialService {
  return {
    async loadCodingPlanApiKey(input) {
      const credentialKey = accountProviderCredentialKey({
        providerId: input.providerId,
        planKind: "individual-coding-plan",
        accountIdentity: input.accountIdentity,
      });
      const cached = normalizeSecret(await options.credentialStore.loadApiKey(credentialKey));
      return cached;
    },
  };
}

function normalizeSecret(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? "";
  return normalized || null;
}
