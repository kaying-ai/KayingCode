import { mobileAccountParams, type MobileAccount } from "@kayingcode/mobile-client-core";

/** 网页依赖完整原始 URL（含版本与 fragment），不能用 relay 参数重建。 */
export function getZcodeWebUrl(account: MobileAccount | null | undefined): string | null {
  if (!account || account.backendType !== "kayingcode") return null;
  const url = account.url.trim();
  return /^https:\/\//i.test(url) && mobileAccountParams(account) ? url : null;
}

export function zcodeWebPageUrl(accountId: string): string {
  return `/pages/zcode-web/index?accountId=${encodeURIComponent(accountId)}`;
}

function decodePageParam(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    return decodeURIComponent(value);
  } catch {
    return undefined;
  }
}

export function readZcodeWebAccountId(params: Record<string, string | undefined>): string | null {
  return decodePageParam(params.accountId) ?? null;
}

export function readZcodeWebProjectParams(params: Record<string, string | undefined>) {
  // 项目入口先为 Taro 路由编码，WebView 构造 URL 前必须解回原始工作区键和设备 SID。
  return {
    kayingWorkspace: decodePageParam(params.workspace) ?? params.workspace,
    sid: decodePageParam(params.deviceSid) ?? params.deviceSid,
  };
}

interface NavigationPorts {
  findAccount: (id: string) => MobileAccount | null;
  navigate: (url: string) => Promise<unknown>;
  touch: (id: string) => void;
}

/** 只拥有一次在途导航；网页业务状态和 KayingCode attachment 都不进入本入口。 */
export function createZcodeWebOpener(ports: NavigationPorts) {
  let opening = false;
  return async (account: MobileAccount): Promise<void> => {
    if (opening) return;
    const saved = ports.findAccount(account.id);
    if (!getZcodeWebUrl(saved) || saved?.url !== account.url) {
      throw new Error("连接信息已失效，请重新添加 Bot");
    }
    opening = true;
    try {
      await ports.navigate(zcodeWebPageUrl(account.id));
      if (ports.findAccount(account.id)?.url === account.url) ports.touch(account.id);
    } finally {
      opening = false;
    }
  };
}
