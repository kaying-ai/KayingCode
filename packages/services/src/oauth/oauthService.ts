import type { ICredentialService } from "../credential/credential.js";
import type { IOAuthService } from "./oauth.js";

/**
 * KayingCode.localrun：无账号系统。
 * 只保留接口形状供 host/RPC 注册；不发起任何 OAuth/官方账号网络请求。
 */
export function createOAuthService(
  credentialService: ICredentialService,
  dependencies: Record<string, unknown> = {},
): IOAuthService {
  void credentialService;
  void dependencies;
  const notSupported = async (action: string): Promise<never> => {
    throw new Error(`OAuth/${action} is not available in KayingCode (no account system)`);
  };
  return {
    getProviders: async () => [],
    getActiveProvider: async () => null,
    restoreCachedSession: async () => null,
    restoreCachedSessionState: async () => ({ status: "signed-out" as const }),
    restoreSession: async () => null,
    startOAuth: () => notSupported("startOAuth"),
    startOAuthWithPolling: () => notSupported("startOAuthWithPolling"),
    pollPendingOAuth: async () => null,
    handleCallback: async () => null,
    refreshToken: () => notSupported("refreshToken"),
    logout: async () => undefined,
    logoutAll: async () => undefined,
    cancelPending: async () => undefined,
    logoutIfCurrentCredentialRequest: async () => false,
  };
}
