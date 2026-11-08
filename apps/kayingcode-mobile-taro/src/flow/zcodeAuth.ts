import {
  ZcodeAuthSession,
  mobileAccountParams,
  type MobileAccount,
} from "@kayingcode/mobile-client-core";
import { taroPlatformPorts } from "../ports/taroPlatform";
import { securePollSecret } from "../ports/taroRandomSource";

const sessions = new Map<string, ZcodeAuthSession>();

/** ZCode 第三方账户与 KayingCode.localrun 分离，JWT 仅保留内存且严格按 origin 隔离。 */
export function zcodeAuthForAccount(account: MobileAccount): ZcodeAuthSession | null {
  const params = mobileAccountParams(account);
  if (params?.backendType !== "zcode" || params.zcodeProtocol !== "v2") return null;
  const origin = params.origin.replace(/^wss:/, "https:");
  let session = sessions.get(origin);
  if (!session) {
    session = new ZcodeAuthSession({
      origin,
      request: taroPlatformPorts.fetch,
      randomSecret: securePollSecret,
    });
    sessions.set(origin, session);
  }
  return session;
}
