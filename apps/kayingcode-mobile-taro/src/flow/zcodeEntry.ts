/** 微信业务域名无法校验时不能套用 H5 网页方案；入口在构建目标确定，避免双连接。 */
export function zcodeEntryMode(target: string | undefined): "native" | "website" {
  return target === "weapp" ? "native" : "website";
}

export function nativeZcodeHomeUrl(accountId: string): string {
  return `/pages/home/index?zcodeAccountId=${encodeURIComponent(accountId)}`;
}

export function readNativeZcodeAccountId(
  params: Record<string, string | undefined>,
): string | null {
  if (!params.zcodeAccountId) return null;
  try {
    return decodeURIComponent(params.zcodeAccountId);
  } catch {
    return null;
  }
}
