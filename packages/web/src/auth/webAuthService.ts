import type { UserInfo } from "@zcode/shared";
const key = "kayingcode-web-account:v2";
interface Session {
  token: string;
  userId: string;
  expiresAt: number;
  /** 已领取邀请的摘要；同一浏览器重开同一链接时不再重复 claim。 */
  inviteDigest?: string;
}
let session: Session | null = null;
export let accountError = "";
function valid(value: unknown): value is Session {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<Session>;
  return (
    typeof item.token === "string" &&
    /^[A-Za-z0-9_-]{43}$/.test(item.token) &&
    typeof item.userId === "string" &&
    !!item.userId &&
    typeof item.expiresAt === "number" &&
    item.expiresAt > Date.now()
  );
}
async function invitationDigest(invite: string): Promise<string | null> {
  try {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(invite));
    return [...new Uint8Array(digest)]
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    // 非安全上下文没有 subtle；此时退化为正常 claim，不阻断授权。
    return null;
  }
}
export async function initializeAccount() {
  session = null;
  accountError = "";
  let saved: Session | null = null;
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? "null");
    if (valid(value)) {
      saved = value;
      session = value;
    }
  } catch {
    /* 禁用存储仍允许本次页面使用授权。 */
  }
  const url = new URL(location.href);
  const invite = new URLSearchParams(url.hash.slice(1)).get("authorize");
  if (!invite) return;
  // 邀请先从历史中清理；重复打开旧链接不能丢掉浏览器已经持有的独立凭据。
  history.replaceState(history.state, "", url.pathname + url.search);
  // 多领取邀请下，同一浏览器重开同一链接不能继续消耗领取次数；只有新邀请才重新 claim。
  if (saved) {
    const digest = await invitationDigest(invite);
    if (digest && saved.inviteDigest === digest) return;
  }
  try {
    const response = await fetch("/api/v1/account/claim", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ invitation: invite }),
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      accountError =
        "Authorization link expired or already used. Scan a new code from your desktop.";
      return;
    }
    const value: unknown = await response.json();
    if (!valid(value)) throw new Error("invalid_session");
    const digest = await invitationDigest(invite);
    session = { ...value, ...(digest ? { inviteDigest: digest } : {}) };
    try {
      localStorage.setItem(key, JSON.stringify(session));
    } catch {
      /* 仅内存会话，刷新时需重新授权。 */
    }
  } catch {
    accountError = "Unable to reach the authorization service. Please try again.";
  }
}
export class WebAuthService {
  getZCodeJwtToken(): string | null {
    // 另一标签页可能刚完成 claim；内存为空时重读共享存储，避免本页继续显示登录。
    if (!session) {
      try {
        const saved: unknown = JSON.parse(localStorage.getItem(key) ?? "null");
        if (valid(saved)) session = saved;
      } catch {
        /* 存储不可用时只使用内存会话。 */
      }
    }
    return session && session.expiresAt > Date.now() ? session.token : null;
  }
  getActiveAccount() {
    return this.getZCodeJwtToken() ? { displayName: "KayingCode", provider: "zai" as const } : null;
  }
  async restoreCachedSession(): Promise<UserInfo | null> {
    return session && this.getZCodeJwtToken()
      ? { id: session.userId, username: "KayingCode", displayName: "KayingCode" }
      : null;
  }
  restoreCachedSessionState() {
    return this.restoreCachedSession();
  }
  startLogin(_options: { [key: string]: unknown } = {}) {
    location.replace("/remote/v4");
  }
  async handleCallback(
    _url: string,
  ): Promise<{ userInfo: UserInfo; appReturnTo: string | null } | null> {
    return null;
  }
  async logout() {
    const token = session?.token;
    session = null;
    try {
      localStorage.removeItem(key);
    } catch {
      /* 本次页面会话已清理。 */
    }
    if (!token) return;
    try {
      await fetch("/api/v1/account/logout", {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      // 网络失败不能阻止本地登出：本页凭据已移除，下一次进入必须重新扫码。
    }
  }
}
export function createWebAuthService() {
  return new WebAuthService();
}
