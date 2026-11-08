/**
 * KayingCode.localrun：无账号 token 刷新。
 */
export function useTokenRefresh(): {
  tryRefresh: () => Promise<boolean>;
  clearCredentials: () => void;
} {
  return {
    tryRefresh: async () => false,
    clearCredentials: () => {},
  };
}
