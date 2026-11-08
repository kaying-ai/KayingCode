import { useEffect } from "react";

/**
 * KayingCode.localrun：无账号 OAuth 会话恢复/轮询。
 * 保留 hook 形状供 Root 组合代码调用；全部为 no-op。
 */
export interface UseRootOAuthEffectsParams {
  intl?: unknown;
  onReauthenticationRequired?: unknown;
  refreshAppSettings?: unknown;
  refreshProviderState?: unknown;
  services?: unknown;
  setIsRestoringOAuthSession?: (value: boolean) => void;
  setOAuthError?: (error: string | null) => void;
  setOAuthPollingActive?: (active: boolean) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setUser?: (user: any) => void;
  markOAuthSuccess?: (provider?: string) => void;
  isRestoringOAuthSession?: boolean;
  oauthPollingActive?: boolean;
  platform?: unknown;
  userId?: string | null;
  [key: string]: unknown;
}

export function useRootOAuthEffects(params: UseRootOAuthEffectsParams): void {
  // KayingCode.localrun：无 OAuth 会话恢复。必须在 effect 里落定，
  // 渲染期 setState 会触发 React「渲染中更新其他组件」并打断启动门禁。
  const setIsRestoringOAuthSession = params.setIsRestoringOAuthSession;
  useEffect(() => {
    setIsRestoringOAuthSession?.(false);
  }, [setIsRestoringOAuthSession]);
}

export function refreshRestoredOAuthProviderFamilyAfterStartup(): Promise<void> {
  return Promise.resolve();
}
