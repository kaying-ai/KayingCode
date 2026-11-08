// Relay 发送账本（MOB-05 / 计划 §8.2 第 6 条）。
//
// pending optimistic overlay 与 commandId 对账的唯一客户端线索：信封构造后、RPC 上行前
// 先登记并持久化；断线丢失 ACK 后由 queryConversationCommandsV4 按权威结果收口。
// 账本不是权威事实：accepted 只标记"已受理"，最终收口锚点是权威 userInput 行的
// sourceCommandId；unknown 表示未达 admission，静默结算并回填草稿，绝不自动重放。
// 语义对齐桌面 pendingCommandRegistry（packages/ui/src/v4），按移动最小面裁剪。
// React 绑定（overlay 订阅 hook）留在各端 shell：核心保持无框架依赖。
import type {
  CommandAck,
  CommandKey,
  CommandsQueryResult,
  ConversationRow,
} from "@zcode/shared/kayingcode-protocol-v4";
import { currentRelayPlatformPorts, type RelayStorageLike } from "./relayPlatform.js";

const PENDING_COMMAND_TTL_MS = 24 * 60 * 60 * 1_000;
const STORAGE_KEY = "kayingcode-relay-pending-commands:v1";
/** commandsQuery 单次上限（commandsQueryParamsSchema max）。 */
const RECONCILE_BATCH = 64;

export type RelayPendingCommandKind = "sendText" | "createSession";

export interface RelayPendingCommandEntry {
  commandId: string;
  kind: RelayPendingCommandKind;
  /** createSession 未绑定会话时为 null（服务端幂等 null 桶）。 */
  sessionId: string | null;
  /** grant 的 opaque workspaceId；单 workspace 附着，仅作防御性隔离记录。 */
  workspaceId: string;
  text: string;
  issuedAt: number;
  /** TTL 锚定首次登记时间；重载/对账不得续期（与桌面一致）。 */
  expiresAt: number;
  /** ACK 已确认受理（accepted/duplicate），等待权威 sourceCommandId 行回显。 */
  acknowledged: boolean;
}

export interface RelayReconcileReport {
  /** createSession 对账确认已受理时恢复出的 sessionId。 */
  recoveredSessionId: string | null;
  /** 未被权威受理（unknown/终态）而回填的草稿文本；null = 无需回填。 */
  restoredDraft: string | null;
}

export interface RelayPendingCommandRecordInput {
  commandId: string;
  kind: RelayPendingCommandKind;
  sessionId: string | null;
  workspaceId: string;
  text: string;
}

type CommandsQuery = (commands: CommandKey[]) => Promise<CommandsQueryResult>;

function isEntry(value: unknown): value is RelayPendingCommandEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<RelayPendingCommandEntry>;
  return (
    typeof entry.commandId === "string" &&
    (entry.kind === "sendText" || entry.kind === "createSession") &&
    (typeof entry.sessionId === "string" || entry.sessionId === null) &&
    typeof entry.workspaceId === "string" &&
    typeof entry.text === "string" &&
    typeof entry.issuedAt === "number" &&
    typeof entry.expiresAt === "number" &&
    typeof entry.acknowledged === "boolean"
  );
}

export class RelayPendingCommandLedger {
  /** 显式注入的存储（测试/宿主隔离）；未注入时经 currentRelayPlatformPorts 惰性解析。 */
  private readonly storageOverride: RelayStorageLike | undefined;
  private readonly now: () => number;
  private readonly entries = new Map<string, RelayPendingCommandEntry>();
  private readonly listeners = new Set<() => void>();

  constructor(options: { storage?: RelayStorageLike; now?: () => number } = {}) {
    // 存储不能在构造期快照：应用（Taro/native）可能在模块加载后才 configure
    // 平台端口；惰性解析保证 configure 前建立的账本实例也使用注入后的存储。
    this.storageOverride = options.storage;
    this.now = options.now ?? Date.now;
    this.load();
  }

  private get storage(): RelayStorageLike | undefined {
    return this.storageOverride ?? currentRelayPlatformPorts().storage;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** 上行前登记；同 commandId 幂等（重试不重复登记）。 */
  record(input: RelayPendingCommandRecordInput): void {
    this.pruneExpired();
    if (this.entries.has(input.commandId)) return;
    const issuedAt = this.now();
    this.entries.set(input.commandId, {
      ...input,
      issuedAt,
      expiresAt: issuedAt + PENDING_COMMAND_TTL_MS,
      acknowledged: false,
    });
    this.commit();
  }

  /**
   * 会话屏 overlay 条目：sessionId 给定时挂该会话的 sendText；null 时只显示
   * createSession（null 桶，"新任务"态）。按登记时间升序。
   */
  listForView(sessionId: string | null): readonly RelayPendingCommandEntry[] {
    this.pruneExpired();
    return [...this.entries.values()]
      .filter((entry) => entry.sessionId === sessionId)
      .sort((left, right) => left.issuedAt - right.issuedAt);
  }

  /**
   * ACK 收口：accepted/duplicate 标记"已受理"等权威回显；createSession 的受理
   * ACK 已绑定 sessionId，直接结算；其余状态（rejected/failed/stale/noop）结算。
   */
  acknowledge(commandId: string, ack: CommandAck): void {
    const entry = this.entries.get(commandId);
    if (!entry) return;
    if (ack.status === "accepted" || ack.status === "duplicate") {
      if (entry.kind === "createSession") {
        this.settle(commandId);
        return;
      }
      if (entry.acknowledged) return;
      this.entries.set(commandId, { ...entry, acknowledged: true });
      this.commit();
      return;
    }
    this.settle(commandId);
  }

  /** 权威回显收口：row.sourceCommandId 即登记的 commandId。 */
  settle(commandId: string): void {
    if (!this.entries.delete(commandId)) return;
    this.commit();
  }

  /** 从投影行收口（快照/delta 的 userInput 行；无 sourceCommandId 的行不动）。 */
  settleFromRows(rows: readonly ConversationRow[]): void {
    let changed = false;
    for (const row of rows) {
      if (row.kind !== "userInput") continue;
      if (row.sourceCommandId && this.entries.delete(row.sourceCommandId)) changed = true;
    }
    if (changed) this.commit();
  }

  clear(): void {
    if (this.entries.size === 0) return;
    this.entries.clear();
    this.commit();
  }

  /**
   * 重连对账（MOB-05）：把 pending 交给权威 commandsQuery 收口。查询失败时抛给
   * 调用方，账本保留等下次连接（与桌面 reconcileSession 一致）。
   */
  async reconcile(query: CommandsQuery, workspaceId?: string): Promise<RelayReconcileReport> {
    this.pruneExpired();
    const entries = [...this.entries.values()]
      .filter((entry) => workspaceId === undefined || entry.workspaceId === workspaceId)
      .sort((left, right) => left.issuedAt - right.issuedAt);
    if (entries.length === 0) return { recoveredSessionId: null, restoredDraft: null };
    const result = await query(
      entries.slice(0, RECONCILE_BATCH).map((entry) => ({
        sessionId: entry.sessionId,
        commandId: entry.commandId,
      })),
    );
    const restored: string[] = [];
    let recoveredSessionId: string | null = null;
    for (const item of result.results) {
      const entry = entries.find((candidate) => candidate.commandId === item.key.commandId);
      if (!entry) continue;
      if (item.result === "unknown") {
        // 权威无记录（未达 admission 或 runtime 已换代）：不可自动重放（§8.2），
        // 结算并回填草稿交由用户决定。
        this.settle(entry.commandId);
        if (entry.text) restored.push(entry.text);
        continue;
      }
      const ack = item.result;
      if (ack.status === "accepted" || ack.status === "duplicate") {
        if (entry.kind === "createSession" && ack.result?.type === "createSession") {
          this.settle(entry.commandId);
          recoveredSessionId ??= ack.result.sessionId;
          continue;
        }
        // 已受理但回显未到：保留"已受理"overlay，等 sourceCommandId 行。
        if (!entry.acknowledged) {
          this.entries.set(entry.commandId, { ...entry, acknowledged: true });
          this.commit();
        }
        continue;
      }
      this.settle(entry.commandId);
      if (entry.text) restored.push(entry.text);
    }
    return {
      recoveredSessionId,
      restoredDraft: restored.length > 0 ? restored.join("\n\n") : null,
    };
  }

  private pruneExpired(): void {
    const now = this.now();
    let changed = false;
    for (const [commandId, entry] of this.entries) {
      if (entry.expiresAt > now) continue;
      this.entries.delete(commandId);
      changed = true;
    }
    if (changed) this.commit();
  }

  private load(): void {
    let raw: string | null = null;
    try {
      raw = this.storage?.getItem(STORAGE_KEY) ?? null;
    } catch {
      return;
    }
    if (!raw) return;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      for (const value of parsed) {
        if (isEntry(value)) this.entries.set(value.commandId, value);
      }
    } catch {
      // 损坏数据视为无账本；下次 commit 覆盖。
    }
  }

  private commit(): void {
    try {
      if (this.entries.size === 0) this.storage?.removeItem(STORAGE_KEY);
      else this.storage?.setItem(STORAGE_KEY, JSON.stringify([...this.entries.values()]));
    } catch {
      // 无 storage（隐私模式/测试环境）：账本退化为进程内。
    }
    for (const listener of this.listeners) listener();
  }
}

/** 应用级单例：跨 RelayAgentConnection 世代（断线重连）持久。 */
export const relayPendingCommands = new RelayPendingCommandLedger();
