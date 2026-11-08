// 移动端连接串的唯一解析点，对齐 Flutter
// `lib/protocol/connection_params.dart`（`ZflowConnectionParams.parse`）。
//
// 支持当前自托管 Web V2 授权链接及上游 ZCode V2 账户链接。
// 旧配对码、fragment v1 与 hash/t HMAC 链接均拒绝，不降级连接。
//
// 纯 TypeScript、无平台依赖：不使用 `URL`（weapp 基础库不保证提供），也不读
// DOM/Node 全局，便于 Taro 与 web 共用同一套判定。

/** 后端类型：与 Flutter `BackendType` 同名同序。 */
export type MobileBackendType = "zcode" | "kayingcode";

export const MOBILE_BACKEND_DISPLAY_NAME: Record<MobileBackendType, string> = {
  zcode: "ZCode",
  kayingcode: "KayingCode",
};

/**
 * 已知服务器域名：只用于跳过「未知服务器」额外确认，不改变连接串格式，
 * 也不放宽传输层校验。按完整域名边界匹配（子域名算已知）。
 */
const KNOWN_HOST_DOMAINS = [
  "z.ai",
  "bigmodel.cn",
  "kayingai.com",
  "kaying.ai",
  "kaying.video",
] as const;

export interface MobileConnectionParams {
  backendType: MobileBackendType;
  /** 原始连接串；后端适配器按需重新解析，本模块不做归一化改写。 */
  raw: string;
  /**
   * 归一化后的源地址（不带路径/查询/凭据）：
   * KayingCode 使用 HTTPS origin，ZCode 保留 `https`/`wss`。
   */
  origin: string;
  host: string;
  port: number | null;
  /** 展示名；ZCode 取 `name` 参数，KayingCode 固定为 "KayingCode Device"，缺省为 null。 */
  deviceName: string | null;
  /** V2 桌面设备身份字段。 */
  deviceSid?: string;
  deviceMid?: string;
  zcodeProtocol: "v2";
  appVersion?: string;
  webEntryVersion?: 2;
}

interface ParsedUrl {
  pathname: string;
  scheme: string;
  host: string;
  port: number | null;
  query: Map<string, string>;
}

const ABSOLUTE_URL = /^([a-zA-Z][a-zA-Z0-9+.-]*):\/\/([^/?#]*)([^?#]*)(?:\?([^#]*))?(?:#.*)?$/;

/** 端口字面量：仅接受 1–65535 的纯数字，其余视为解析失败。 */
function parsePort(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null;
  const value = Number.parseInt(raw, 10);
  return value >= 1 && value <= 65535 ? value : null;
}

function parseQuery(raw: string): Map<string, string> {
  const query = new Map<string, string>();
  if (raw.length === 0) return query;
  for (const pair of raw.split("&")) {
    if (pair.length === 0) continue;
    const separator = pair.indexOf("=");
    const key = separator < 0 ? pair : pair.slice(0, separator);
    const value = separator < 0 ? "" : pair.slice(separator + 1);
    query.set(decodeURIComponent(key), decodeURIComponent(value));
  }
  return query;
}

/**
 * 手写绝对 URL 解析（scheme/authority/path/query）。
 * 无法解析或 authority 为空返回 null —— 空 origin 绝不能进入 URL 构造，
 * 否则会在部分运行时抛 `Invalid URL`。
 */
function parseAbsoluteUrl(raw: string): ParsedUrl | null {
  const match = ABSOLUTE_URL.exec(raw);
  if (!match) return null;
  const scheme = (match[1] ?? "").toLowerCase();
  const authority = match[2] ?? "";
  const queryRaw = match[4] ?? "";
  if (scheme.length === 0 || authority.length === 0) return null;

  if (/[\s\\@]/.test(authority)) return null;
  const hostPort = authority;

  let host: string;
  let port: number | null = null;
  if (hostPort.startsWith("[")) {
    const end = hostPort.indexOf("]");
    if (end < 0) return null;
    host = hostPort.slice(0, end + 1);
    const rest = hostPort.slice(end + 1);
    if (rest.length > 0) {
      if (!rest.startsWith(":")) return null;
      port = parsePort(rest.slice(1));
      if (port === null) return null;
    }
  } else {
    const colon = hostPort.lastIndexOf(":");
    if (colon >= 0) {
      host = hostPort.slice(0, colon);
      port = parsePort(hostPort.slice(colon + 1));
      if (port === null) return null;
    } else {
      host = hostPort;
    }
  }
  if (host.length === 0) return null;
  return { scheme, host, port, pathname: match[3] || "/", query: parseQuery(queryRaw) };
}

function buildOrigin(scheme: string, host: string, port: number | null): string {
  return port === null ? `${scheme}://${host}` : `${scheme}://${host}:${port}`;
}

function queryValue(query: Map<string, string>, key: string): string | null {
  const value = query.get(key)?.trim();
  return value === undefined || value.length === 0 ? null : value;
}

/** 解析 ZCode 连接 URL；只接受 `https`/`wss`，明文源会降级整条会话链路。 */
function parseZcodeUrl(raw: string): MobileConnectionParams | null {
  const parsed = parseAbsoluteUrl(raw);
  if (!parsed) return null;
  if (parsed.scheme !== "https" && parsed.scheme !== "wss") return null;

  const deviceSid = queryValue(parsed.query, "sid");
  // 旧 hash/t HMAC 连接不再接入，不能把旧凭据降级解释成 V2。
  if (deviceSid === null || parsed.query.has("hash") || parsed.query.has("t")) return null;

  return {
    backendType: "zcode",
    raw,
    origin: buildOrigin(parsed.scheme, parsed.host, parsed.port),
    host: parsed.host,
    port: parsed.port,
    deviceName: queryValue(parsed.query, "name"),
    deviceSid,
    zcodeProtocol: "v2",
    appVersion: queryValue(parsed.query, "app_version") ?? undefined,
    deviceMid: queryValue(parsed.query, "mid") ?? undefined,
  };
}

/** 解析连接串；两种格式都不匹配时返回 null。 */
export function parseMobileConnection(raw: string): MobileConnectionParams | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  try {
    const absolute = parseAbsoluteUrl(trimmed);
    const fragmentStart = trimmed.indexOf("#");
    const authorization = fragmentStart >= 0 ? parseQuery(trimmed.slice(fragmentStart + 1)) : null;
    if (authorization?.has("authorize")) {
      const params = parseZcodeUrl(trimmed);
      if (
        !absolute ||
        absolute.scheme !== "https" ||
        absolute.pathname !== "/remote/v4" ||
        params?.zcodeProtocol !== "v2" ||
        !/^[A-Za-z0-9_-]{43}$/.test(authorization.get("authorize") ?? "")
      )
        return null;
      // 授权由网页单次消费，App 保留完整 URL，不能重建为旧 Node Relay 配对。
      return { ...params, backendType: "kayingcode", webEntryVersion: 2 };
    }
    return trimmed.includes("#") ? null : parseZcodeUrl(trimmed);
  } catch {
    return null;
  }
}

/** 已知服务器判定：只读连接串主机名，子域名算已知。 */
export function isKnownMobileHost(params: MobileConnectionParams): boolean {
  const host = params.host.toLowerCase().replace(/\.$/, "");
  return KNOWN_HOST_DOMAINS.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

/**
 * Bot 卡片用的远端展示串：只暴露主机与端口，不带路径、查询串或凭据。
 * 主机缺失时给中性文案，不回落完整链接。
 */
export function describeMobileRemote(params: MobileConnectionParams | null): string {
  if (!params || params.host.length === 0) return "远端地址未知";
  const host = params.host.includes(":") ? `[${params.host}]` : params.host;
  return params.port === null ? `远端 ${host}` : `远端 ${host}:${params.port}`;
}

/** 档案默认展示名：连接串自带名称优先，其次主机名。 */
export function defaultMobileAccountLabel(params: MobileConnectionParams | null): string {
  if (!params) return "未命名设备";
  return params.deviceName ?? (params.host.length > 0 ? params.host : "未命名设备");
}
