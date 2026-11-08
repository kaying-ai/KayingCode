// `crypto.getRandomValues` 的小程序平台适配：Taro 的 `getRandomValues`
// （微信 `wx.getRandomValues`）只有 Promise 形态，包一层交给随机字节池。
// 平台 SDK 只在这个文件里出现，randomSource / runtimeGlobals 保持可测。
import Taro from "@tarojs/taro";
import type { RandomSource } from "./randomSource";

export function taroRandomSource(): RandomSource | null {
  // H5：Taro 不实现该 API，返回 null（那边有原生 crypto，不会走到池上）。
  if (typeof Taro.getRandomValues !== "function") return null;
  return (byteLength) =>
    Taro.getRandomValues({ length: byteLength }).then(
      (result) => new Uint8Array(result.randomValues),
    );
}

/** OAuth poll secret 是凭据，必须直接等待系统随机源，禁止使用 ID 随机池的退化分支。 */
export async function securePollSecret(): Promise<string> {
  const bytes =
    process.env.TARO_ENV === "weapp"
      ? new Uint8Array((await Taro.getRandomValues({ length: 32 })).randomValues)
      : globalThis.crypto.getRandomValues(new Uint8Array(32));
  if (bytes.length !== 32) throw new Error("Secure random source unavailable");
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
