export const DEFAULT_DESKTOP_REMOTE_ORIGIN = "https://relay.service.kaying.ai";
import { randomBytes } from "node:crypto";
import type { ICredentialService } from "@zcode/services";
import type { WebRemoteControlLogin } from "./web-remote-relay/contract.js";

/**
 * 手机远控 Relay origin 的解析顺序：
 * 用户设置 > 进程环境 > 本地 .env 快照 > 默认生产 origin。
 * 用户设置只来自已校验的 AppSettings；非法环境变量仍按原有语义抛错。
 */
export function resolveDesktopRemoteOrigin(
  options: {
    overrideOrigin?: string;
    processEnv?: { KAYINGCODE_OFFICIAL_CLOUDFLARE_RELAY_ORIGIN?: string };
    localEnv?: { KAYINGCODE_OFFICIAL_CLOUDFLARE_RELAY_ORIGIN?: string };
  } = {},
): string {
  const configured =
    options.overrideOrigin?.trim() ||
    options.processEnv?.KAYINGCODE_OFFICIAL_CLOUDFLARE_RELAY_ORIGIN?.trim() ||
    options.localEnv?.KAYINGCODE_OFFICIAL_CLOUDFLARE_RELAY_ORIGIN?.trim();
  return configured ? new URL(configured).origin : DEFAULT_DESKTOP_REMOTE_ORIGIN;
}
/** 本机 owner 与浏览器 terminal 分离；Main 只向二维码暴露一次性邀请。 */
export function createDesktopRemoteAccount(options: {
  origin: string;
  credentials: Pick<ICredentialService, "load" | "save">;
  fetch?: typeof fetch;
}) {
  const origin = new URL(options.origin).origin;
  const storageKey = `remote-account:v2:${origin}`;
  const request = options.fetch ?? fetch;
  let login: Promise<WebRemoteControlLogin> | undefined;
  async function post(path: string, body: unknown, secret?: string, signal?: AbortSignal) {
    const response = await request(new URL(path, origin), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(secret ? { authorization: `Bearer ${secret}` } : {}),
      },
      body: JSON.stringify(body),
      redirect: "error",
      signal: AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(15000)]),
    });
    if (!response.ok) throw new Error("远控授权服务不可用，请重试");
    return response.json();
  }
  async function loadLogin(): Promise<WebRemoteControlLogin> {
    let secret = await options.credentials.load(storageKey);
    if (!secret) {
      secret = randomBytes(32).toString("base64url");
      // 先持久化本机秘密，注册响应丢失时才能幂等重试而不创建第二个账号。
      await options.credentials.save(storageKey, secret);
    }
    const data = (await post("/api/v1/account/register", { ownerSecret: secret })) as {
      userId?: unknown;
    };
    if (typeof data.userId !== "string" || !data.userId) throw new Error("远控账号响应无效");
    return { userId: data.userId, jwt: secret };
  }
  return {
    async getLogin() {
      login ??= loadLogin().catch((error) => {
        login = undefined;
        throw error;
      });
      return login;
    },
    async createMobileAuthorization(signal: AbortSignal) {
      const current = await this.getLogin();
      const data = (await post("/api/v1/account/invite", {}, current.jwt, signal)) as {
        invitation?: unknown;
      };
      if (typeof data.invitation !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(data.invitation))
        throw new Error("远控邀请响应无效");
      return new URLSearchParams({ authorize: data.invitation }).toString();
    },
  };
}
