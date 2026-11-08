import type { RemoteTarget } from "@zcode/shared";

export interface RemoteConnectFailurePayload {
  reasonCode?: string;
  retryable?: boolean;
  profileId?: string;
  resolvedWslTarget?: Required<Extract<RemoteTarget, { kind: "wsl" }>>;
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

/**
 * Host 与 Main 之间的连接失败消息必须携带稳定错误码。
 *
 * Bug 原因：过去只回 `error.message`，Main 只能把 `source-server-install-required` /
 * `source-server-upgrade-required` / 身份变化归成 `remote-connection-unknown`，
 * 于是 UI 永远拿不到安装或升级入口。这里按 Host 错误对象显式投影可公开字段，
 * 未声明的字段不猜测。
 */
export function buildRemoteConnectFailurePayload(error: unknown): RemoteConnectFailurePayload {
  const record = readRecord(error);
  const resolved = readRecord(record.resolvedWslTarget);
  const resolvedWslTarget =
    resolved.kind === "wsl" &&
    typeof resolved.distro === "string" &&
    resolved.distro.trim().length > 0 &&
    typeof resolved.user === "string" &&
    resolved.user.trim().length > 0
      ? {
          kind: "wsl" as const,
          distro: resolved.distro,
          user: resolved.user,
        }
      : undefined;
  return {
    ...(typeof record.code === "string" ? { reasonCode: record.code } : {}),
    ...(typeof record.retryable === "boolean" ? { retryable: record.retryable } : {}),
    ...(typeof record.profileId === "string" ? { profileId: record.profileId } : {}),
    ...(resolvedWslTarget ? { resolvedWslTarget } : {}),
  };
}
