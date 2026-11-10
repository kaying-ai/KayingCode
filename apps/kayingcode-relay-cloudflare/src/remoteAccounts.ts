export interface RemoteAccountStorage {
  get<T>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<boolean>;
}
export interface RemoteAuthority {
  userId: string;
  role: "owner" | "terminal";
  expiresAt: number;
}
interface Invitation {
  userId: string;
  expiresAt: number;
  /** 旧记录没有该字段时按一次性邀请处理。 */
  remainingClaims?: number;
}
export interface RemoteInvitePolicy {
  /** 邀请从签发到失效的时长。 */
  inviteTtlMs: number;
  /** 同一邀请允许成功 claim 的次数；1 表示一次性。 */
  inviteMaxClaims: number;
  /** claim 成功后签发的终端凭据有效期。 */
  terminalTtlMs: number;
}
const DEFAULT_REMOTE_INVITE_POLICY: RemoteInvitePolicy = {
  inviteTtlMs: 5 * 60 * 1000,
  inviteMaxClaims: 1,
  terminalTtlMs: 30 * 86400000,
};
const DAY_MS = 86400000;
const INVITE_TTL_DAYS = { minMs: 60000, maxMs: 30 * DAY_MS, fallbackMs: 5 * 60000 };
const INVITE_MAX_CLAIMS = { min: 1, max: 1000, fallback: 1 };
const TERMINAL_TTL_DAYS = { minMs: 3600000, maxMs: 90 * DAY_MS, fallbackMs: 30 * DAY_MS };
function readInteger(
  value: string | undefined,
  range: { min: number; max: number; fallback: number },
): number {
  const parsed = Number(value?.trim());
  return Number.isSafeInteger(parsed) && parsed >= range.min && parsed <= range.max
    ? parsed
    : range.fallback;
}
/** 天数支持小数，例如 0.5 表示 12 小时；非法或越界回退默认时长。 */
function readDaysAsMs(
  value: string | undefined,
  range: { minMs: number; maxMs: number; fallbackMs: number },
): number {
  const days = Number(value?.trim());
  if (!Number.isFinite(days) || days <= 0) return range.fallbackMs;
  const ms = Math.round(days * DAY_MS);
  return ms >= range.minMs && ms <= range.maxMs ? ms : range.fallbackMs;
}
/** 受控部署可延长邀请/终端凭据；天数为单位，非法或越界配置回退默认值，不阻断部署。 */
export function resolveRemoteInvitePolicy(env: {
  KAYINGCODE_REMOTE_INVITE_TTL_DAYS?: string;
  KAYINGCODE_REMOTE_INVITE_MAX_CLAIMS?: string;
  KAYINGCODE_REMOTE_TERMINAL_TTL_DAYS?: string;
}): RemoteInvitePolicy {
  return {
    inviteTtlMs: readDaysAsMs(env.KAYINGCODE_REMOTE_INVITE_TTL_DAYS, INVITE_TTL_DAYS),
    inviteMaxClaims: readInteger(env.KAYINGCODE_REMOTE_INVITE_MAX_CLAIMS, INVITE_MAX_CLAIMS),
    terminalTtlMs: readDaysAsMs(env.KAYINGCODE_REMOTE_TERMINAL_TTL_DAYS, TERMINAL_TTL_DAYS),
  };
}
export function randomRemoteSecret(bytes = 32): string {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(bytes))))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}
export async function remoteSecretDigest(secret: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}
/** 调用方 DO 在一个串行事务内执行；持久化只存摘要，不保留 bearer 或邀请原文。 */
export class RemoteAccounts {
  constructor(
    private readonly storage: RemoteAccountStorage,
    private readonly now = Date.now,
    private readonly policy: RemoteInvitePolicy = DEFAULT_REMOTE_INVITE_POLICY,
  ) {}
  async register(secret: string) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(secret)) throw new Error("invalid_owner_secret");
    const key = `credential:${await remoteSecretDigest(secret)}`;
    const existing = await this.storage.get<RemoteAuthority>(key);
    if (existing && existing.role !== "owner") throw new Error("wrong_role");
    const authority: RemoteAuthority = existing ?? {
      userId: crypto.randomUUID(),
      role: "owner",
      expiresAt: 253402300799000,
    };
    await this.storage.put(key, authority);
    return { userId: authority.userId };
  }
  async authenticate(token: string): Promise<RemoteAuthority | null> {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
    const key = `credential:${await remoteSecretDigest(token)}`;
    const authority = await this.storage.get<RemoteAuthority>(key);
    if (!authority) return null;
    if (authority.expiresAt <= this.now()) {
      await this.storage.delete(key);
      return null;
    }
    return authority;
  }
  async invite(owner: RemoteAuthority) {
    if (owner.role !== "owner") throw new Error("wrong_role");
    const invitation = randomRemoteSecret();
    const expiresAt = this.now() + this.policy.inviteTtlMs;
    await this.storage.put(`invitation:${await remoteSecretDigest(invitation)}`, {
      userId: owner.userId,
      expiresAt,
      remainingClaims: this.policy.inviteMaxClaims,
    } satisfies Invitation);
    return { invitation, expiresAt };
  }
  async claim(secret: string) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(secret)) throw new Error("invalid_invitation");
    const key = `invitation:${await remoteSecretDigest(secret)}`;
    const invitation = await this.storage.get<Invitation>(key);
    if (!invitation || invitation.expiresAt <= this.now()) {
      // 长 TTL 配置下过期邀请会保留更久；claim 时顺手清理，避免继续占用存储。
      if (invitation) await this.storage.delete(key);
      throw new Error("invalid_invitation");
    }
    const remainingClaims = invitation.remainingClaims ?? 1;
    if (!Number.isSafeInteger(remainingClaims) || remainingClaims < 1) {
      await this.storage.delete(key);
      throw new Error("invalid_invitation");
    }
    if (remainingClaims > 1) {
      await this.storage.put(key, {
        ...invitation,
        remainingClaims: remainingClaims - 1,
      } satisfies Invitation);
    } else {
      await this.storage.delete(key);
    }
    const token = randomRemoteSecret();
    const expiresAt = this.now() + this.policy.terminalTtlMs;
    await this.storage.put(`credential:${await remoteSecretDigest(token)}`, {
      userId: invitation.userId,
      role: "terminal",
      expiresAt,
    } satisfies RemoteAuthority);
    return { token, userId: invitation.userId, expiresAt };
  }
  async logout(token: string) {
    const authority = await this.authenticate(token);
    if (!authority || authority.role !== "terminal") throw new Error("wrong_role");
    await this.storage.delete(`credential:${await remoteSecretDigest(token)}`);
  }
}
