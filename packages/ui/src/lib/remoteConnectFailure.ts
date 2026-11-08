import type { WSLConnectOptions } from "@zcode/shared";
import { getErrorMessage } from "@/lib/errorMessage.js";

/** 连接失败时 Host 会附带可继续操作的上下文；UI 不能只保留 message。 */
export interface RemoteConnectFailure extends Error {
  code?: string;
  profileId?: string;
  resolvedWslTarget?: Required<WSLConnectOptions>;
}

export interface RemoteConnectFailurePayload {
  error?: string;
  reasonCode?: string;
  profileId?: string;
  resolvedWslTarget?: Required<WSLConnectOptions>;
}

export function buildRemoteConnectFailure(
  payload: RemoteConnectFailurePayload,
  fallback: string,
): RemoteConnectFailure {
  const failure = new Error(
    getErrorMessage(payload.error || fallback),
  ) as RemoteConnectFailure;
  if (payload.reasonCode) failure.code = payload.reasonCode;
  if (payload.profileId) failure.profileId = payload.profileId;
  if (payload.resolvedWslTarget) failure.resolvedWslTarget = payload.resolvedWslTarget;
  return failure;
}

export type RemoteConnectRetryAction =
  | { kind: "install" }
  | { kind: "upgrade"; target: "server" | "controller" }
  | { kind: "confirm-identity" };

/**
 * 连接失败后是否还有可继续的受控动作。
 * 只认 Host 的稳定错误码；message 文案随语言变化，不能参与判定。
 */
export function resolveRemoteConnectRetryAction(
  error: unknown,
): RemoteConnectRetryAction | null {
  const code =
    error && typeof error === "object" && "code" in error && typeof error.code === "string"
      ? error.code
      : undefined;
  if (code === "source-server-install-required") return { kind: "install" };
  if (code === "source-server-upgrade-required") return { kind: "upgrade", target: "server" };
  if (code === "source-server-identity-change-pending") return { kind: "confirm-identity" };
  return null;
}

/** 安装/升级等待时 Host 已解析出的 WSL 身份优先于用户当前表单值。 */
export function resolveRetryTarget<T extends { kind: string }>(
  currentTarget: T,
  failure: unknown,
): T {
  if (
    currentTarget.kind === "wsl" &&
    failure &&
    typeof failure === "object" &&
    "resolvedWslTarget" in failure &&
    failure.resolvedWslTarget &&
    typeof failure.resolvedWslTarget === "object"
  ) {
    return failure.resolvedWslTarget as T;
  }
  return currentTarget;
}

export function readProfileId(error: unknown): string | undefined {
  return error && typeof error === "object" && "profileId" in error
    ? typeof error.profileId === "string"
      ? error.profileId
      : undefined
    : undefined;
}
