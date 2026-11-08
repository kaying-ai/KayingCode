// Relay H5 会话投影（自 relaySession.ts 拆出，400 行上限）。
// 职责：conversation 与 sessions-index 两种 topic 的消费侧投影——snapshot 全量替换 +
// 五种/两种 delta。滚动锚点、选择、草稿面板等桌面交互态不在此（属各端 shell）。
//
// 聊天页对齐批次：补上 A 区可读状态（control/availability/inputRouting/meta/config/
// usage/queue/goal/plan/backgroundWorks/subagents）与 CAS 定序事实（revision/logEpoch）；
// resync 快照只带尾部窗口，已翻回的历史用 keep-old merge 保留。
import type {
  BackgroundWorkSummary,
  ConversationDelta,
  ConversationRow,
  ConversationSnapshot,
  ConversationTopicFrame,
  GoalState,
  InputRouting,
  PendingInteraction,
  PlanState,
  QueueState,
  SessionActionAvailability,
  SessionConfigState,
  SessionControl,
  SessionMetaState,
  SessionSummary,
  SessionUsageState,
  SessionsIndexTopicFrame,
  SubagentProjectionState,
} from "@zcode/shared/kayingcode-protocol-v4";

/** 会话流消费侧投影：键级整体替换，键内绝不深合并（与 statePatch 语义一致）。 */
export class RelayConversationProjection {
  rows: ConversationRow[] = [];
  totalCount = 0;
  /** 全序第一行 rowId；已加载首行等于它 ⇔ 历史已到顶（游标分页判定）。 */
  firstRowId: number | null = null;
  /** 服务端投影水位：CAS 命令的 baseRevision 与 stale 判定都用它。 */
  revision = 0;
  /** 会话日志纪元：row-target 命令的 baseLogEpoch。 */
  logEpoch = "";
  control: SessionControl | null = null;
  availability: SessionActionAvailability | null = null;
  inputRouting: InputRouting | null = null;
  meta: SessionMetaState | null = null;
  config: SessionConfigState | null = null;
  usage: SessionUsageState | null = null;
  queue: QueueState | null = null;
  goal: GoalState | null = null;
  plan: PlanState | null = null;
  backgroundWorks: BackgroundWorkSummary[] = [];
  subagents: SubagentProjectionState | null = null;
  /** 等待交互全集（permission/userInput 作答；workspaceHookReview 提示去电脑端）。 */
  pendingInteractions: PendingInteraction[] = [];
  /** 更早历史是否还有；null = 尚未得知（初始快照未截断）。 */
  olderHasMore: boolean | null = null;

  get phase(): string {
    return this.control?.phase ?? "";
  }

  get sessionEnded(): boolean {
    return this.control?.sessionEnded ?? false;
  }

  get canStop(): boolean {
    return this.control?.canStop ?? false;
  }

  get lastError(): string | null {
    return this.control?.lastError?.message ?? null;
  }

  get title(): string {
    return this.meta?.title ?? "";
  }

  get pendingInteractionCount(): number {
    return this.pendingInteractions.length;
  }

  applyFrame(frame: ConversationTopicFrame): void {
    if (frame.payload.kind === "snapshot") {
      this.applySnapshot(frame.payload.snapshot);
      return;
    }
    for (const delta of frame.payload.deltas) {
      this.applyDelta(delta);
    }
  }

  private applySnapshot(snapshot: ConversationSnapshot): void {
    // resync 快照只带尾部窗口；已经翻回的历史不能因为一次 resync 就消失。
    const incoming = [...snapshot.rows.window];
    const firstIncoming = incoming[0]?.rowId;
    const older =
      firstIncoming === undefined ? [] : this.rows.filter((row) => row.rowId < firstIncoming);
    this.rows = [...older, ...incoming];
    this.totalCount = Math.max(snapshot.rows.totalCount, this.rows.length);
    this.firstRowId = snapshot.rows.firstRowId;
    this.revision = snapshot.revision ?? 0;
    this.logEpoch = snapshot.logEpoch ?? "";
    this.control = snapshot.control ?? null;
    // A 区按 additive 演进：线上 Node 可能是旧版本，缺字段时按"未知"处理，
    // 不让整帧抛错——移动端与 Node 的发布节奏不保证同步。
    this.availability = snapshot.availability ?? null;
    this.inputRouting = snapshot.inputRouting ?? null;
    this.meta = snapshot.meta ?? null;
    this.config = snapshot.config ?? null;
    this.usage = snapshot.usage ?? null;
    this.queue = snapshot.queue ?? null;
    this.goal = snapshot.goal ?? null;
    this.plan = snapshot.plan ?? null;
    this.backgroundWorks = [...(snapshot.backgroundWorks ?? [])];
    this.subagents = snapshot.subagents ?? null;
    this.pendingInteractions = [...(snapshot.pendingInteractions ?? [])];
    this.refreshOlderHasMore();
  }

  private applyDelta(delta: ConversationDelta): void {
    switch (delta.op) {
      case "row.appended":
        this.rows = [...this.rows, delta.row];
        this.totalCount += 1;
        return;
      case "row.upserted": {
        const index = this.rows.findIndex((row) => row.rowId === delta.row.rowId);
        if (index === -1) {
          this.rows = [...this.rows, delta.row];
          this.totalCount += 1;
        } else {
          const rows = [...this.rows];
          rows[index] = delta.row;
          this.rows = rows;
        }
        return;
      }
      case "row.removed":
        this.rows = this.rows.filter((row) => row.rowId < delta.fromRowId);
        this.totalCount = Math.min(this.totalCount, this.rows.length);
        return;
      case "row.delta": {
        const index = this.rows.findIndex((row) => row.rowId === delta.rowId);
        if (index === -1) return;
        const rows = [...this.rows];
        rows[index] = appendStreamableText(rows[index]!, delta.path, delta.append);
        this.rows = rows;
        return;
      }
      case "state.updated": {
        const patch = delta.patch;
        if (patch.revision !== undefined) this.revision = patch.revision;
        if (patch.control) this.control = patch.control;
        if (patch.availability) this.availability = patch.availability;
        if (patch.inputRouting) this.inputRouting = patch.inputRouting;
        if (patch.meta) this.meta = patch.meta;
        if (patch.config) this.config = patch.config;
        if (patch.usage) this.usage = patch.usage;
        if (patch.queue) this.queue = patch.queue;
        // goal/plan 可被显式置 null（清空目标/计划），因此按 undefined 判断而不是真值。
        if (patch.goal !== undefined) this.goal = patch.goal;
        if (patch.plan !== undefined) this.plan = patch.plan;
        if (patch.backgroundWorks) this.backgroundWorks = [...patch.backgroundWorks];
        if (patch.subagents) this.subagents = patch.subagents;
        if (patch.pendingInteractions) {
          this.pendingInteractions = [...patch.pendingInteractions];
        }
        return;
      }
    }
  }

  /** rows range 回补（MOB-C-005）：升序批次整体前插；rowId 去重防重叠拼接。 */
  prependRows(olderRowsAscending: ConversationRow[]): void {
    if (olderRowsAscending.length === 0) return;
    const known = new Set(this.rows.map((row) => row.rowId));
    const fresh = olderRowsAscending.filter((row) => !known.has(row.rowId));
    if (fresh.length === 0) return;
    this.rows = [...fresh, ...this.rows];
    this.totalCount = Math.max(this.totalCount, this.rows.length);
    this.refreshOlderHasMore();
  }

  /** 已加载首行早于全序首行 ⇒ 还有更早历史；否则已到顶。 */
  private refreshOlderHasMore(): void {
    const firstLoaded = this.rows[0]?.rowId;
    if (this.firstRowId === null || firstLoaded === undefined) {
      this.olderHasMore = false;
      return;
    }
    this.olderHasMore = firstLoaded > this.firstRowId;
  }
}

function appendStreamableText(
  row: ConversationRow,
  path: "text" | "inputText" | "output.text" | "summaryText",
  append: string,
): ConversationRow {
  if (path === "output.text") {
    const output = (row as { output?: { text?: string } }).output;
    if (!output || typeof output.text !== "string") return row;
    return { ...row, output: { ...output, text: output.text + append } } as ConversationRow;
  }
  const current = (row as Record<string, unknown>)[path];
  if (typeof current !== "string") return row;
  return { ...row, [path]: current + append } as ConversationRow;
}

/**
 * 任务列表最小投影（v4 sessions-index）：快照全量替换 + upserted/removed 两种 delta。
 * 排序（lastActivityAt 降序）是展示逻辑，交给渲染层。
 */
export class RelaySessionsIndexProjection {
  sessions: SessionSummary[] = [];

  applyFrame(frame: SessionsIndexTopicFrame): void {
    if (frame.payload.kind === "snapshot") {
      this.sessions = [...frame.payload.snapshot.sessions];
      return;
    }
    for (const delta of frame.payload.deltas) {
      if (delta.op === "session.upserted") {
        const index = this.sessions.findIndex((s) => s.sessionId === delta.session.sessionId);
        if (index === -1) this.sessions = [...this.sessions, delta.session];
        else {
          const sessions = [...this.sessions];
          sessions[index] = delta.session;
          this.sessions = sessions;
        }
      } else {
        this.sessions = this.sessions.filter((s) => s.sessionId !== delta.sessionId);
      }
    }
  }
}
