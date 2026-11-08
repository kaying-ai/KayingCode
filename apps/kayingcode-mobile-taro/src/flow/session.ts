// 当前档案输入仅接收 V2 URL；连接由上游协议桥或 Web 页面拥有。
import {
  addMobileAccount,
  isKnownMobileHost,
  parseMobileConnection,
  type MobileAccount,
} from "@kayingcode/mobile-client-core";

/** 用户粘贴/扫码输入的处理结果；未知服务器交给调用方先做二次确认。 */
export type AccountInputResult =
  | { status: "added"; account: MobileAccount }
  | { status: "unknown-host"; host: string }
  | { status: "invalid" };

/**
 * 解析连接信息并落盘档案。壳首页与设备管理页共用同一判定，避免「已知服务器」
 * 规则在两处漂移。
 */
export function addAccountFromInput(rawUrl: string): AccountInputResult {
  const params = parseMobileConnection(rawUrl);
  if (!params || params.backendType !== "kayingcode") return { status: "invalid" };
  if (!isKnownMobileHost(params)) return { status: "unknown-host", host: params.host };
  const account = addMobileAccount(rawUrl);
  return account ? { status: "added", account } : { status: "invalid" };
}

/** 二次确认后的强制入库（用户在弹窗里明确接受了未知服务器）。 */
export function forceAddAccountFromInput(rawUrl: string): MobileAccount | null {
  return parseMobileConnection(rawUrl)?.backendType === "kayingcode"
    ? addMobileAccount(rawUrl)
    : null;
}
