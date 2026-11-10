import { normalizeKayingCodeEndpointOrigin } from "./kayingcodeEndpoint.js";

/**
 * 用户自定义手机远控 Relay origin。
 * Taro/Flutter 客户端只接受 https 连接串，http Relay 生成的二维码会被手机端拒绝；
 * 因此在设置入口就限制为 https，避免保存一个不可用的地址。
 */
export function normalizeMobileRelayOrigin(value: string): string {
  const origin = normalizeKayingCodeEndpointOrigin(value);
  if (!origin) {
    return "";
  }
  if (new URL(origin).protocol !== "https:") {
    throw new Error("Mobile relay origin must use https");
  }
  return origin;
}
