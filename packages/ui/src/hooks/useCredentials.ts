/**
 * useCredentials —— 凭据服务 hooks
 *
 * KayingCode.localrun：无账号 OAuth token；仅保留本地凭据 CRUD（模型 API Key 等）。
 */
import { useCallback } from "react";
import { useServices } from "./useServices.js";

/** 凭据管理的基础 hook */
export function useCredentials() {
  const { credentialService } = useServices();

  const load = useCallback((key: string) => credentialService.load(key), [credentialService]);
  const save = useCallback(
    (key: string, value: string) => credentialService.save(key, value),
    [credentialService],
  );
  const del = useCallback((key: string) => credentialService.delete(key), [credentialService]);

  return { load, save, delete: del };
}

/** KayingCode.localrun：无账号 access_token，恒为 null。 */
export function useAuthToken() {
  const getToken = useCallback(async () => null, []);
  const setToken = useCallback(async (_token: string) => {
    throw new Error("OAuth access token is not available in KayingCode (no account system)");
  }, []);
  const clearToken = useCallback(async () => {}, []);
  return { getToken, setToken, clearToken };
}
