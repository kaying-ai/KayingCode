// ZCode（zflow）后端会话编排（阶段 4）。
//
// 纯 TS，不 import Taro：socket 工厂 / 平台名 / 版本经参数注入，便于在 Node 里
// 用假 socket 单测（对齐 core 的注入缝）。Taro 侧由 flow/session.ts 装配 weapp 的
// SocketTask 工厂（H5 留空 → core 用浏览器原生 WebSocket）。
//
// 分层：本模块只做「连接 → 配对 → 工作区目录 → 工作区桥」的编排与原生字段归一，
// 不持有 UI 状态（状态在 flow/store.ts），也不实现会话通道（conversation.dart 的
// ConversationTransport 属会话映射批次）。
import {
  describeError,
  ZflowClient,
  mobileAccountParams,
  type BridgeSession,
  type MobileAccount,
  type ZflowRelayState,
  type ZflowSocketFactory,
} from "@kayingcode/mobile-client-core";
import type { ConnectionStatus } from "./store";

/** V2 鉴权错误转为用户可操作的说明，内部错误码只在协议层流转。 */
export function describeZcodeConnectionError(error: unknown): string {
  const reason = describeError(error);
  if (reason === "auth-required") return "请登录与电脑端相同的 ZCode 账号。";
  if (reason === "auth-timeout") return "设备认证超时，请检查网络后重试。";
  if (reason === "relay-unavailable") return "暂时无法连接 ZCode 中转服务，请稍后重试。";
  return reason;
}

/** ZCode 工作区条目（宿主 bootstrap 的 {path,label?,workspaceIdentity?} 归一）。 */
export interface ZcodeWorkspace {
  /** 桥/topic 用键：`workspaceIdentity?.trim() || workspacePath`（与宿主算法一致）。 */
  workspaceKey: string;
  label: string;
  path: string;
  workspaceIdentity?: string;
}

export interface ZcodeClientDeps {
  /** weapp 注入 SocketTask 适配；H5 留空走浏览器缺省。 */
  socketFactory?: ZflowSocketFactory;
  /** 握手 meta.platform（如实上报 ios/android/h5）。 */
  platformName: string;
  appVersion?: string | null;
  onLog?: (line: string) => void;
  getTerminalToken?: () => Promise<string>;
}

/**
 * relay 状态 → 壳层连接状态（对齐 Flutter `_MappedConnectionState.map`，
 * 但把 `waiting` 归到 `pairing`：那是「等待桌面端批准」，不是链路未就绪）。
 */
export function mapRelayStateToConnectionStatus(state: ZflowRelayState): ConnectionStatus {
  switch (state) {
    case "connecting":
    case "authenticating":
    case "reconnecting":
      return "connecting";
    case "waiting":
      return "pairing";
    case "paired":
      return "paired";
    case "error":
    case "kicked":
    case "closed":
      return "error";
    default:
      return "idle";
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function lastPathSegment(path: string): string {
  const parts = path.split(/[\\/]/).filter((part) => part.length > 0);
  return parts.length > 0 ? parts[parts.length - 1]! : path;
}

/** 单条工作区归一；缺键返回 null（不生成半成品条目）。 */
export function normalizeZcodeWorkspace(raw: unknown): ZcodeWorkspace | null {
  const record = asRecord(raw);
  if (!record) return null;
  const identity = nonEmptyString(record.workspaceIdentity);
  const path = nonEmptyString(record.workspacePath) ?? nonEmptyString(record.path) ?? "";
  const explicitKey = nonEmptyString(record.workspaceKey);
  const workspaceKey = identity ?? (path.length > 0 ? path : explicitKey);
  if (workspaceKey === null) return null;
  const label =
    nonEmptyString(record.label) ??
    (path.length > 0 ? lastPathSegment(path) : null) ??
    identity ??
    workspaceKey;
  return {
    workspaceKey,
    label,
    path: path.length > 0 ? path : workspaceKey,
    ...(identity ? { workspaceIdentity: identity } : {}),
  };
}

/**
 * bootstrap / workspace-list 的 result → 工作区目录。
 * 接受 `{workspaces: [...]}`（bootstrap）或裸数组（workspace-list-response）。
 */
export function normalizeZcodeWorkspaces(result: unknown): ZcodeWorkspace[] {
  const list = Array.isArray(result) ? result : (asRecord(result)?.workspaces ?? null);
  if (!Array.isArray(list)) return [];
  const workspaces: ZcodeWorkspace[] = [];
  for (const entry of list) {
    const workspace = normalizeZcodeWorkspace(entry);
    if (workspace) workspaces.push(workspace);
  }
  return workspaces;
}

/** URL 合法的 ZCode 档案；V2 账户鉴权在连接时由登录所有者提供。 */
export function isConnectableZcodeAccount(account: MobileAccount): boolean {
  const params = mobileAccountParams(account);
  return params !== null && params.backendType === "zcode";
}

/**
 * 构造 ZCode 客户端。档案不是 ZCode 连接时抛错（调用方不应走到这里）。
 */
export function createZflowClient(account: MobileAccount, deps: ZcodeClientDeps): ZflowClient {
  const params = mobileAccountParams(account);
  if (!params || params.backendType !== "zcode") {
    throw new Error("该档案不是 ZCode 连接");
  }
  return new ZflowClient(params, {
    ...(deps.socketFactory ? { socketFactory: deps.socketFactory } : {}),
    platformName: deps.platformName,
    appVersion: deps.appVersion ?? null,
    onLog: deps.onLog ?? (() => undefined),
    getTerminalToken: deps.getTerminalToken,
  });
}

/** 一次已打开的工作区桥（client 与其 bridge 绑在一起，切换时整体替换）。 */
export interface ZcodeOpenBridge {
  client: ZflowClient;
  bridge: BridgeSession;
  workspaceKey: string;
}
