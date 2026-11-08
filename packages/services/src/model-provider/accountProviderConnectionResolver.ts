/**
 * KayingCode.localrun：无账号 Provider 连接解析。
 * 自定义/第三方 Provider 由本地配置驱动，不解析账号套餐连接。
 */
import type {
  AccountProviderConnectionResolver,
  AccountProviderConfigSnapshot,
  ProviderConfigSnapshot,
  ProviderSource,
} from "@zcode/provider";

export interface AccountProviderConnectionSettings {
  readonly providerFamilyDomain: string | null;
  readonly selections: Record<string, unknown>;
  readonly unresolvedFamilies?: readonly string[];
}

export interface AccountProviderFamilyAvailabilityInput {
  readonly family: string;
  readonly providers: readonly unknown[];
  readonly selections: Record<string, unknown>;
}

export type AccountProviderFamilyAvailabilityResolver = (
  input: AccountProviderFamilyAvailabilityInput,
) => Promise<Record<string, unknown>>;

export interface AccountProviderConnectionResolverOptions {
  readonly readSettings: () => Promise<AccountProviderConnectionSettings>;
  readonly loadCodingPlanApiKey: (
    providerId: string,
    family: string,
    accountIdentity: string,
    forceRefresh: boolean,
  ) => Promise<string | null>;
  readonly loadAccountIdentity: (family: string) => Promise<string | null>;
  readonly resolveFamilyAvailability: AccountProviderFamilyAvailabilityResolver;
}

export interface CodingPlanFamilyAvailabilityResolverOptions {
  readonly apiClient?: unknown;
  readonly credentialService?: unknown;
}

export interface AccountProviderConfigSourceOptions
  extends AccountProviderConnectionResolverOptions {
  readonly configSource: ProviderSource<ProviderConfigSnapshot>;
}

/** 恒返回空账号 Provider 连接集合。 */
export function createAccountProviderConnectionResolver(
  _options: AccountProviderConnectionResolverOptions,
): AccountProviderConnectionResolver {
  return async () => [];
}

export function createCodingPlanFamilyAvailabilityResolver(
  _options: CodingPlanFamilyAvailabilityResolverOptions,
): AccountProviderFamilyAvailabilityResolver {
  return async () => ({});
}

export interface AccountProviderConfigSourceHandle
  extends ProviderSource<AccountProviderConfigSnapshot> {
  refresh: (reason?: string) => Promise<AccountProviderConfigSnapshot>;
  onDidRefreshError: (
    listener: (event: { error: unknown; reasons: string[] }) => void,
  ) => () => void;
  dispose: () => void;
}

export function createAccountProviderConfigSource(
  options: AccountProviderConfigSourceOptions,
): AccountProviderConfigSourceHandle {
  // KayingCode.localrun：无账号 Overlay，恒为空 Provider 集合。
  // Registry 校验 account.basedOnKayingCodeBuiltinRevision === config.kayingcodeBuiltinRevision，
  // 不匹配时首次加载会静默丢弃 waiters，导致 getView() 永久挂起。必须读 config revision 对齐。
  let revision = 0;
  const snapshot = (builtinRevision: string): AccountProviderConfigSnapshot =>
    ({
      revision: `localrun-${revision}`,
      basedOnKayingCodeBuiltinRevision: builtinRevision,
      providers: new Map(),
      states: {},
    }) as unknown as AccountProviderConfigSnapshot;
  const readAligned = async (): Promise<AccountProviderConfigSnapshot> => {
    const config = await options.configSource.read();
    return snapshot(config.kayingcodeBuiltinRevision);
  };
  return {
    read: readAligned,
    onDidChange: () => () => {},
    refresh: async () => {
      revision += 1;
      return readAligned();
    },
    onDidRefreshError: () => () => {},
    dispose: () => {},
  };
}

export async function resolveCurrentAccountAccess(_input: {
  access?: unknown;
  readSettings?: unknown;
  loadAccountIdentity?: unknown;
}): Promise<null> {
  return null;
}
