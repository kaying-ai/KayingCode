// Taro 平台端口实现（MOB-P-002 阶段一，注入 core 的 RelayPlatformPorts）：
// storage→Taro 存储、deviceInfo→系统信息、randomHex→Math.random、fetch→Taro.request。
// H5 target 同样走本端口（Taro H5 分投到 XHR/Storage）；weapp 合法域名配置属
// 小程序后台 + DEC-006 外部证据。
import Taro from "@tarojs/taro";
import type { RelayPlatformPorts } from "@kayingcode/mobile-client-core";
import type { RelayDeviceOs } from "@kayingcode/mobile-client-core";
import { randomHex } from "./randomSource";

/** 系统外观变化只通过平台端口进入 UI；weapp 与 H5 分别使用原生事件。 */
export function systemThemeIsLight(): boolean {
  if (process.env.TARO_ENV !== "weapp" && typeof window !== "undefined" && window.matchMedia) {
    return window.matchMedia("(prefers-color-scheme: light)").matches;
  }
  try {
    return Taro.getSystemInfoSync().theme === "light";
  } catch {
    return false;
  }
}

export function observeSystemTheme(listener: (light: boolean) => void): () => void {
  if (process.env.TARO_ENV === "weapp") {
    const onChange = (event: { theme: string }) => listener(event.theme === "light");
    Taro.onThemeChange(onChange);
    return () => Taro.offThemeChange(onChange);
  }
  if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
    const media = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = (event: MediaQueryListEvent) => listener(event.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }
  return () => undefined;
}

type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "HEAD" | "OPTIONS" | "TRACE" | "CONNECT";

export const taroPlatformPorts: RelayPlatformPorts = {
  storage: {
    getItem: (key) => {
      try {
        // weapp 对不存在的 key 返回空串；归一为 null。
        const value = Taro.getStorageSync(key);
        return typeof value === "string" && value.length > 0 ? value : null;
      } catch {
        return null;
      }
    },
    setItem: (key, value) => {
      try {
        Taro.setStorageSync(key, value);
      } catch {
        // 容量/隐私模式失败：与 core 约定一致，退化为内存态。
      }
    },
    removeItem: (key) => {
      try {
        Taro.removeStorageSync(key);
      } catch {
        // 同上
      }
    },
  },

  deviceInfo: () => {
    try {
      const info = Taro.getSystemInfoSync();
      const system = `${info.system ?? ""}`;
      // os 是设备身份命名轴（KYC_{os}_app_{uuid}）：HarmonyOS 如实上报，识别不了用 other。
      const os: RelayDeviceOs = /harmony|openharmony/i.test(system)
        ? "harmony"
        : info.platform === "ios"
          ? "ios"
          : info.platform === "android"
            ? "android"
            : info.platform === "windows"
              ? "windows"
              : info.platform === "mac"
                ? "macos"
                : "other";
      if (info.platform === "ios") return { platform: "ios", deviceName: "iPhone", os };
      if (info.platform === "android") return { platform: "android", deviceName: "Android", os };
      return { platform: "h5", deviceName: "Browser", os };
    } catch {
      // 开发者工具/异常环境：回落 h5，与 web 端展示语义一致。
      return { platform: "h5", deviceName: "Browser", os: "other" };
    }
  },

  /**
   * 设备指纹随机源（`sha256:<hex>` 的 hex 部分）走 randomSource 的字节池：
   * 池够用时就是 `wx.getRandomValues` 的密码学随机数，池空（首帧）时退化为
   * Math.random。指纹仅是设备唯一性展示标识（core relayPlatform 注释），
   * 不是凭据也不是 attestation；App 壳（MOB-P-004）接入 Keychain/Keystore 后换源。
   */
  randomHex,

  fetch: async (url, init) => {
    const method = (init?.method ?? "GET") as HttpMethod;
    if (init?.signal?.aborted) throw new Error("relay.request.cancelled");
    const task = Taro.request({
      url,
      method,
      timeout: 15_000,
      // POST body 为 JSON 字符串（core REST 封装约定）；Taro 对字符串原样发送。
      data: init?.body,
      header: init?.headers ?? {},
    });
    const abort = () => task.abort();
    init?.signal?.addEventListener("abort", abort, { once: true });
    let response: Awaited<typeof task>;
    try {
      response = await task;
      if (init?.signal?.aborted) throw new Error("relay.request.cancelled");
    } finally {
      init?.signal?.removeEventListener("abort", abort);
    }
    const status = response.statusCode;
    return {
      ok: status >= 200 && status < 300,
      status,
      // Taro 默认 dataType=json，data 已是解析后的对象；非 JSON 响应为原始字符串，
      // core 的 parseFault 对两者都能收敛到 http 状态码兜底。
      json: async () => response.data,
    };
  },
};
