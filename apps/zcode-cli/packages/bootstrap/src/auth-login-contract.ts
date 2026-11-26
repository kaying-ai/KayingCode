import type {
  createCodingPlanApiKeyResolver,
  createCliOAuthClient,
  BrowserOpenResult,
  CliOAuthInitData,
  CliOAuthPollData,
  CliOAuthUser,
  SharedKayingCodeCredentialStore,
} from "@zcode/adapters";
import type { EnvRecord } from "@zcode/adapters/model";

export type CodingPlanProviderId = "bigmodel" | "zai";

export interface LoginKayingCodeCliOptions {
  providerId?: CodingPlanProviderId;
  abortSignal?: AbortSignal;
  apiKeyResolver?: ReturnType<typeof createCodingPlanApiKeyResolver>;
  baseUrl?: string;
  credentialStore?: SharedKayingCodeCredentialStore;
  env?: EnvRecord;
  httpClient?: Parameters<typeof createCliOAuthClient>[0]["httpClient"];
  noBrowser?: boolean;
  now?: () => number;
  onAuthorizeUrl?: (data: CliOAuthInitData) => void | Promise<void>;
  onBrowserOpen?: (result: BrowserOpenResult) => void | Promise<void>;
  onPollStatus?: (data: CliOAuthPollData) => void | Promise<void>;
  openBrowser?: (url: string) => Promise<BrowserOpenResult>;
  pollToken?: string;
  sleep?: (ms: number) => Promise<void>;
  timeoutMs?: number;
  personalProviderConfigPath?: string;
}

export interface LoginKayingCodeCliResult {
  browser?: BrowserOpenResult;
  configPath: string;
  credentialsPath: string;
  model: string;
  providerId: CodingPlanProviderId;
  user: CliOAuthUser;
}

// BigModel 与 Z.ai 共用服务端轮询登录，只是 providerId 固定为 bigmodel。
export type LoginBigmodelCodingPlanOptions = Omit<LoginKayingCodeCliOptions, "providerId">;
export type LoginBigmodelCodingPlanResult = LoginKayingCodeCliResult & { providerId: "bigmodel" };

export interface ConfigureCodingPlanApiKeyOptions {
  apiKey: string;
  credentialStore?: SharedKayingCodeCredentialStore;
  env?: EnvRecord;
  personalProviderConfigPath?: string;
  providerId: CodingPlanProviderId;
}

export interface ConfigureCodingPlanApiKeyResult {
  configPath: string;
  model: string;
  providerId: CodingPlanProviderId;
}

export interface LogoutKayingCodeCliOptions {
  credentialStore?: SharedKayingCodeCredentialStore;
  env?: EnvRecord;
}

export interface LogoutKayingCodeCliResult {
  credentialsPath: string;
}

export class KayingCodeCliLoginError extends Error {
  readonly code:
    | "auth_failed"
    | "auth_timeout"
    | "config_update_failed"
    | "credential_write_failed";

  constructor(
    code: KayingCodeCliLoginError["code"],
    message: string,
    options: { cause?: unknown } = {},
  ) {
    super(message, options);
    this.name = "KayingCodeCliLoginError";
    this.code = code;
  }
}
