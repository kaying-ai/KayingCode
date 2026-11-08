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
    const expiresAt = this.now() + 300000;
    await this.storage.put(`invitation:${await remoteSecretDigest(invitation)}`, {
      userId: owner.userId,
      expiresAt,
    });
    return { invitation, expiresAt };
  }
  async claim(secret: string) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(secret)) throw new Error("invalid_invitation");
    const key = `invitation:${await remoteSecretDigest(secret)}`;
    const invitation = await this.storage.get<Invitation>(key);
    if (!invitation || invitation.expiresAt <= this.now()) throw new Error("invalid_invitation");
    await this.storage.delete(key);
    const token = randomRemoteSecret();
    const expiresAt = this.now() + 30 * 86400000;
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
