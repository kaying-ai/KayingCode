// Bot 档案对齐 Flutter AccountStore；storage 端口同步写入，不维护设备配对凭据。
// 档案包含完整 V2 URL，导出可能带一次性邀请；OAuth 凭据不进入档案。
import { uuidv7 } from "@zcode/shared";
import {
  defaultMobileAccountLabel,
  parseMobileConnection,
  type MobileBackendType,
  type MobileConnectionParams,
} from "./mobileConnectionParams.js";
import {
  currentRelayPlatformPorts,
  type RelayPlatformPorts,
} from "./relayPlatform.js";

const ACCOUNTS_STORAGE_KEY = "kayingcode-mobile-accounts:v1";

/** 导出文件标识：与 Flutter `exportJson()` 同构，便于两端互相导入。 */
const EXPORT_APP = "kayingcode";
const EXPORT_FORMAT = "devices";
const EXPORT_VERSION = 1;

export interface MobileAccount {
  id: string;
  label: string;
  /** 原始 V2 URL。 */
  url: string;
  backendType: MobileBackendType;
  addedAt: number;
  lastUsedAt: number | null;
}

export interface MobileAccountExport {
  app: string;
  format: string;
  version: number;
  exportedAt: string;
  accounts: MobileAccount[];
}

function storageOf(ports: RelayPlatformPorts) {
  return ports.storage;
}

function parseAccount(value: unknown): MobileAccount | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  const url = typeof record.url === "string" ? record.url : "";
  if (url.length === 0) return null;
  const backendType = record.backendType === "kayingcode" ? "kayingcode" : "zcode";
  const addedAt = typeof record.addedAt === "number" ? record.addedAt : 0;
  return {
    id: typeof record.id === "string" && record.id.length > 0 ? record.id : uuidv7(),
    label:
      typeof record.label === "string" && record.label.trim().length > 0
        ? record.label
        : defaultMobileAccountLabel(parseMobileConnection(url)),
    url,
    backendType,
    addedAt,
    lastUsedAt: typeof record.lastUsedAt === "number" ? record.lastUsedAt : null,
  };
}

function readAccounts(ports: RelayPlatformPorts): MobileAccount[] {
  const raw = storageOf(ports)?.getItem(ACCOUNTS_STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const accounts: MobileAccount[] = [];
    for (const item of parsed) {
      const account = parseAccount(item);
      if (account) accounts.push(account);
    }
    return accounts;
  } catch {
    // 存储损坏时不静默清空：返回空列表但不覆写，避免把用户档案写没。
    return [];
  }
}

function writeAccounts(accounts: readonly MobileAccount[], ports: RelayPlatformPorts): void {
  storageOf(ports)?.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(accounts));
}

/** 自托管按 origin+SID 隔离，原生上游按完整 V2 URL 去重。 */
export function mobileAccountDedupKey(account: MobileAccount): string {
  const params = parseMobileConnection(account.url);
  if (params?.backendType === "kayingcode") return `kayingcode:${params.origin}:${params.deviceSid}`;
  return `zcode:${account.url}`;
}

/**
 * 设备凭据的存储键：只有 KayingCode 需要独立凭据（claim 换取的
 * access/refresh token）；ZCode 的连接串自身携带 sid/hash，返回 null。
 */




/** 解析档案的连接串；连接串损坏时返回 null。 */
export function mobileAccountParams(account: MobileAccount): MobileConnectionParams | null {
  return parseMobileConnection(account.url);
}

/** 全部档案，最近使用的在前（壳层据此决定默认连接哪台）。 */
export function listMobileAccounts(ports: RelayPlatformPorts = currentRelayPlatformPorts()): MobileAccount[] {
  return readAccounts(ports).sort((a, b) => (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0));
}

export function findMobileAccount(
  id: string,
  ports: RelayPlatformPorts = currentRelayPlatformPorts(),
): MobileAccount | null {
  return readAccounts(ports).find((account) => account.id === id) ?? null;
}

/**
 * 按连接串新增（或更新）档案；连接串无法解析时返回 null。
 * 自托管新邀请更新同 origin+SID 的既有档案；不同设备保留独立档案。
 */
export function addMobileAccount(
  url: string,
  options?: { label?: string },
  ports: RelayPlatformPorts = currentRelayPlatformPorts(),
): MobileAccount | null {
  const params = parseMobileConnection(url);
  if (!params) return null;
  const accounts = readAccounts(ports);
  // 去重键必须与 mobileAccountDedupKey 同源，避免两处算法漂移。
  const dedupKey =
    params.backendType === "kayingcode" ? `kayingcode:${params.origin}:${params.deviceSid}` : `zcode:${url}`;
  const existing = accounts.find((account) => mobileAccountDedupKey(account) === dedupKey);

  const label = options?.label?.trim();
  const account: MobileAccount = existing
    ? {
        ...existing,
        url,
        backendType: params.backendType,
        ...(label && label.length > 0 ? { label } : {}),
      }
    : {
        id: uuidv7(),
        label:
          label && label.length > 0 ? label : defaultMobileAccountLabel(params),
        url,
        backendType: params.backendType,
        addedAt: Date.now(),
        lastUsedAt: null,
      };

  writeAccounts(
    [...accounts.filter((other) => mobileAccountDedupKey(other) !== dedupKey), account],
    ports,
  );
  return account;
}

export function renameMobileAccount(
  id: string,
  label: string,
  ports: RelayPlatformPorts = currentRelayPlatformPorts(),
): void {
  const accounts = readAccounts(ports);
  const trimmed = label.trim();
  if (trimmed.length === 0) return;
  writeAccounts(
    accounts.map((account) => (account.id === id ? { ...account, label: trimmed } : account)),
    ports,
  );
}

/** 该服务器是否还有其他档案引用同一份凭据（决定删除时是否清凭据）。 */


/** 删除档案；同一 origin 的最后一个档案被删除时一并清掉设备凭据。 */
export function removeMobileAccount(
  id: string,
  ports: RelayPlatformPorts = currentRelayPlatformPorts(),
): void {
  const accounts = readAccounts(ports);
  const next = accounts.filter((account) => account.id !== id);
  writeAccounts(next, ports);
}

/** 记录最近使用时间，供壳层冷启动选择默认 Bot。 */
export function touchMobileAccount(
  id: string,
  ports: RelayPlatformPorts = currentRelayPlatformPorts(),
): void {
  const accounts = readAccounts(ports);
  writeAccounts(
    accounts.map((account) =>
      account.id === id ? { ...account, lastUsedAt: Date.now() } : account,
    ),
    ports,
  );
}

/**
 * 导出全部档案（含连接串）。自托管授权链接可能携带一次性邀请，导出文件等同于密码，
 * 调用方必须在 UI 上明确告警。
 */
export function exportMobileAccounts(
  ports: RelayPlatformPorts = currentRelayPlatformPorts(),
): string {
  const payload: MobileAccountExport = {
    app: EXPORT_APP,
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    accounts: readAccounts(ports),
  };
  return JSON.stringify(payload);
}

/**
 * 从导出文件恢复档案；跳过连接串无效、重复（按去重键）的条目。
 * 返回实际导入条数；格式不合法抛 `Error`。
 */
export function importMobileAccounts(
  raw: string,
  ports: RelayPlatformPorts = currentRelayPlatformPorts(),
): number {
  let decoded: unknown;
  try {
    decoded = JSON.parse(raw);
  } catch {
    throw new Error("不是有效的设备导出文件");
  }
  const list =
    typeof decoded === "object" && decoded !== null && Array.isArray((decoded as MobileAccountExport).accounts)
      ? (decoded as MobileAccountExport).accounts
      : Array.isArray(decoded)
        ? decoded
        : null;
  if (!list) throw new Error("不是有效的设备导出文件");

  const accounts = readAccounts(ports);
  const seen = new Set(accounts.map((account) => mobileAccountDedupKey(account)));
  let added = 0;
  for (const item of list) {
    const account = parseAccount(item);
    if (!account || !parseMobileConnection(account.url)) continue;
    const dedupKey = mobileAccountDedupKey(account);
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);
    accounts.push(account);
    added += 1;
  }
  if (added > 0) writeAccounts(accounts, ports);
  return added;
}
