// 平台端口（计划 §6.1 platform ports）：移动核心的四处环境触点全部收口在此——
// 存储（设备身份/凭证/账本）、设备展示信息、随机源、控制面 REST。
// H5 缺省实现直用浏览器全局，行为与第五~八批一致（含非 secure context 下
// crypto.getRandomValues 可用、无 localStorage 时账本退化为内存）；weapp/native
// 经 ports 注入平台 adapter（MOB-P-002/004），核心不 import 任何平台 SDK。
export type RelayDeviceOs = "ios" | "android" | "harmony" | "macos" | "windows" | "linux" | "other";

export interface RelayStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface RelayDeviceInfo {
  /** Relay 设备平台枚举展示信息：ios / android / weapp / h5。 */
  platform: "ios" | "android" | "weapp" | "h5";
  deviceName: string;
  /** 真实运行操作系统；无法识别时为 `other`。 */
  os: RelayDeviceOs;
}

export interface RelayPlatformRequestInit {
  signal?: AbortSignal;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

export interface RelayPlatformResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

export type RelayPlatformFetch = (
  url: string,
  init?: RelayPlatformRequestInit,
) => Promise<RelayPlatformResponse>;

/**
 * storage 为 undefined 表示"无持久化"（账本退化为内存）；其余三项必填，
 * 注入方可用 `{ ...defaultRelayPlatformPorts, fetch }` 覆盖单项。
 */
export interface RelayPlatformPorts {
  storage?: RelayStorageLike;
  deviceInfo: () => RelayDeviceInfo;
  randomHex: (byteLength: number) => string;
  fetch: RelayPlatformFetch;
}

function defaultStorage(): RelayStorageLike | undefined {
  try {
    return globalThis.localStorage as RelayStorageLike | undefined;
  } catch {
    return undefined;
  }
}

/** UA 探测，语义与第五批 detectPlatform/detectDeviceName 相同（合并为一口），并补设备身份命名用的真实 OS。 */
function defaultDeviceInfo(): RelayDeviceInfo {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  if (/iphone|ipad|ipod/i.test(ua)) return { platform: "ios", deviceName: "iPhone", os: "ios" };
  if (/android/i.test(ua)) return { platform: "android", deviceName: "Android", os: "android" };
  if (/harmony|openharmony/i.test(ua))
    return { platform: "h5", deviceName: "Browser", os: "harmony" };
  if (/windows/i.test(ua)) return { platform: "h5", deviceName: "Browser", os: "windows" };
  if (/mac os|macintosh/i.test(ua)) return { platform: "h5", deviceName: "Browser", os: "macos" };
  if (/linux/i.test(ua)) return { platform: "h5", deviceName: "Browser", os: "linux" };
  return { platform: "h5", deviceName: "Browser", os: "other" };
}

/**
 * 设备指纹随机源（sha256:<hex> 的 hex 部分）：优先 crypto.getRandomValues——
 * 手机经 `http://<局域网IP>` 访问 H5 不是 secure context，randomUUID/subtle
 * 不可用，但 getRandomValues 可用；彻底无 crypto 时退化为 Math.random。
 */
function defaultRandomHex(byteLength: number): string {
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const bytes = new Uint8Array(byteLength);
    crypto.getRandomValues(bytes);
    return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  let hex = "";
  for (let i = 0; i < byteLength * 2; i += 1) hex += Math.floor(Math.random() * 16).toString(16);
  return hex;
}

async function defaultFetch(
  url: string,
  init?: RelayPlatformRequestInit,
): Promise<RelayPlatformResponse> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (init?.signal?.aborted) throw new Error("relay.request.cancelled");
  init?.signal?.addEventListener("abort", abort, { once: true });
  // 旧 WebView 可能没有 AbortSignal.any/timeout；期限涵盖正文读取，不增加恢复 owner。
  const timer = setTimeout(abort, 15_000);
  try {
    const response = await fetch(url, { cache: "no-store", ...init, signal: controller.signal });
    const body = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      json: async () => JSON.parse(body) as unknown,
    };
  } catch {
    // fetch 错误可能含秘密 URL，不让原始错误进入页面或诊断日志。
    throw new Error(init?.signal?.aborted ? "relay.request.cancelled" : "relay.request.failed");
  } finally {
    clearTimeout(timer);
    init?.signal?.removeEventListener("abort", abort);
  }
}

/** 缺省端口：惰性解析浏览器/Node 全局，导出供注入方展开覆盖单项。 */
export const defaultRelayPlatformPorts: RelayPlatformPorts = {
  get storage() {
    return defaultStorage();
  },
  deviceInfo: defaultDeviceInfo,
  randomHex: defaultRandomHex,
  fetch: defaultFetch,
};

let activePorts: RelayPlatformPorts = defaultRelayPlatformPorts;

/**
 * 平台装配入口：H5 浏览器缺省即 defaultRelayPlatformPorts；Taro/native 应用在
 * 启动早期（任何端口消费发生前）调用一次注入实现。全部消费点经
 * currentRelayPlatformPorts() 惰性解析——ESM import 求值顺序早于应用入口的
 * configure 调用，因此不允许任何模块在加载期捕获端口快照。
 */
export function configureRelayPlatformPorts(override: Partial<RelayPlatformPorts>): void {
  activePorts = { ...defaultRelayPlatformPorts, ...override };
}

/** 当前生效端口；core 内所有缺省参数都从这里取值（惰性，不允许加载期快照）。 */
export function currentRelayPlatformPorts(): RelayPlatformPorts {
  return activePorts;
}
