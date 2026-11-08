// conversation 与 sessions-index 两种 topic 的订阅生命周期（自 relaySession.ts 拆出，
// 400 行上限；方法体自第五~八批实现原样搬移）。
// 帧上游先于 subscribe RPC 建立：快照是 post-response 投递，可能先于 ACK 到达——
// 先缓冲、拿到 subscriptionId 后按序放行（第五批实测竞态，顺序不可改动）。
import { createTopicWireDecoder } from "@zcode/client/v4/topic-wire-decoder";
import type { MobileAgentService } from "./mobileAgentService.js";
import {
  TopicWireFrameAssembler,
  conversationTopicFrameSchema,
  sessionsIndexTopicFrameSchema,
  type ConversationRow,
  type ConversationTopicFrame,
  type SessionsIndexTopicFrame,
} from "@zcode/shared/kayingcode-protocol-v4";
import { RelayConversationProjection, RelaySessionsIndexProjection } from "./relayProjection.js";
import type { RelayPendingCommandLedger } from "./relayPendingCommands.js";
import type { RelayWorkspaceTarget } from "./relayWorkspaceTarget.js";

/**
 * 会话流订阅者：投影 + sourceCommandId 收口锚定（MOB-05）+ rows range 回补。
 * 投影实例在 unsubscribe 时重置，重订阅即拿到全量快照（= resync）。
 */
export class RelayConversationSubscriber {
  private generation = 0;
  private readonly agent: MobileAgentService;
  private readonly workspace: RelayWorkspaceTarget;
  /** MOB-05 发送账本；null 供测试隔离（不登记/不结算/不对账）。 */
  private readonly pending: RelayPendingCommandLedger | null;
  private projection = new RelayConversationProjection();
  private frameUpstream: { dispose(): void } | null = null;
  private currentSubscriptionId: string | null = null;
  private pendingFrames: ConversationTopicFrame[] | null = null;
  private decoder: ReturnType<typeof createTopicWireDecoder<ConversationTopicFrame>> | null = null;
  private onProjection: ((projection: RelayConversationProjection) => void) | null = null;

  constructor(
    agent: MobileAgentService,
    workspace: RelayWorkspaceTarget,
    pending: RelayPendingCommandLedger | null,
  ) {
    this.agent = agent;
    this.workspace = workspace;
    this.pending = pending;
  }

  get current(): RelayConversationProjection {
    return this.projection;
  }

  /**
   * 订阅会话流；帧先于 ACK 绑定也可能到达，因此上游订阅先于 subscribe RPC 建立
   * （与 ui transport 同序），投影只接受当前 subscriptionId 的帧。
   */
  async subscribe(
    sessionId: string,
    onUpdate: (projection: RelayConversationProjection) => void,
  ): Promise<void> {
    const generation = this.generation + 1;
    await this.unsubscribe();
    if (generation !== this.generation) return;

    // 与 sessions-index 同因：快照可能先于 ACK 到达，先缓冲再放行。
    this.pendingFrames = [];
    const decoder = createTopicWireDecoder<ConversationTopicFrame>(
      new TopicWireFrameAssembler(conversationTopicFrameSchema),
      (frame) => {
        if (generation !== this.generation) return;
        if (this.currentSubscriptionId === null) {
          this.pendingFrames?.push(frame);
          return;
        }
        if (frame.subscriptionId !== this.currentSubscriptionId) return;
        this.projection.applyFrame(frame);
        this.settleFromFrame(frame);
        this.onProjection?.(this.projection);
      },
    );
    this.decoder = decoder;
    this.onProjection = onUpdate;
    this.frameUpstream = this.agent.onDynamicConversationFrame(this.workspace)((wire) => {
      decoder.accept(wire);
    });

    const result = await this.agent.subscribeConversationV4({
      ...this.workspace,
      sessionId,
    });
    // 切换会话/断开时旧 ACK 可能晚到，不能绑定到新订阅并吞掉快照。
    if (generation !== this.generation) {
      await this.agent
        .unsubscribeConversationV4({ ...this.workspace, subscriptionId: result.ack.subscriptionId })
        .catch(() => undefined);
      return;
    }
    this.currentSubscriptionId = result.ack.subscriptionId;
    const pending = this.pendingFrames ?? [];
    this.pendingFrames = null;
    let applied = false;
    for (const frame of pending) {
      if (frame.subscriptionId !== this.currentSubscriptionId) continue;
      this.projection.applyFrame(frame);
      this.settleFromFrame(frame);
      applied = true;
    }
    if (applied) this.onProjection?.(this.projection);
  }

  async unsubscribe(): Promise<void> {
    this.generation++;
    const subscriptionId = this.currentSubscriptionId;
    this.currentSubscriptionId = null;
    this.pendingFrames = null;
    this.frameUpstream?.dispose();
    this.frameUpstream = null;
    this.decoder?.clear();
    this.decoder = null;
    this.onProjection = null;
    this.projection = new RelayConversationProjection();
    if (subscriptionId) {
      await this.agent
        .unsubscribeConversationV4({ ...this.workspace, subscriptionId })
        .catch(() => undefined);
    }
  }

  /**
   * rows range 回补（MOB-C-005）：取当前窗口第一行之前的更早历史并前插投影。
   * 返回服务端 hasMore，供 UI 决定是否继续显示"加载更早消息"。
   */
  async loadOlderRows(sessionId: string, limit = 30): Promise<{ hasMore: boolean }> {
    const generation = this.generation;
    const firstRowId = this.projection.rows[0]?.rowId;
    const result = await this.agent.conversationRowsRangeV4({
      ...this.workspace,
      sessionId,
      ...(firstRowId !== undefined ? { beforeRowId: firstRowId } : {}),
      limit,
    });
    if (generation !== this.generation) return { hasMore: result.hasMore };
    this.projection.prependRows(result.rows);
    this.projection.olderHasMore = result.hasMore;
    this.onProjection?.(this.projection);
    return { hasMore: result.hasMore };
  }

  /**
   * 权威回显收口（MOB-05）：快照/delta 中带 sourceCommandId 的 userInput 行
   * 是 overlay 的最终锚点。结算必须先于 onProjection 回调，同一渲染批内
   * pending overlay 与权威行不会同时出现。
   */
  private settleFromFrame(frame: ConversationTopicFrame): void {
    if (!this.pending) return;
    if (frame.payload.kind === "snapshot") {
      this.pending.settleFromRows(frame.payload.snapshot.rows.window);
      return;
    }
    const rows: ConversationRow[] = [];
    for (const delta of frame.payload.deltas) {
      if (delta.op === "row.appended" || delta.op === "row.upserted") rows.push(delta.row);
    }
    this.pending.settleFromRows(rows);
  }
}

/** 任务列表订阅者（v4 sessions-index，与桌面任务列表同源）。 */
export class RelaySessionsIndexSubscriber {
  private generation = 0;
  private readonly agent: MobileAgentService;
  private readonly workspace: RelayWorkspaceTarget;
  private projection: RelaySessionsIndexProjection | null = null;
  private upstream: { dispose(): void } | null = null;
  private subscriptionId: string | null = null;
  private pendingFrames: SessionsIndexTopicFrame[] | null = null;
  private decoder: ReturnType<typeof createTopicWireDecoder<SessionsIndexTopicFrame>> | null = null;
  private onUpdate: ((projection: RelaySessionsIndexProjection) => void) | null = null;

  constructor(agent: MobileAgentService, workspace: RelayWorkspaceTarget) {
    this.agent = agent;
    this.workspace = workspace;
  }

  get current(): RelaySessionsIndexProjection | null {
    return this.projection;
  }

  /**
   * 订阅任务列表。不用 listSessions：CLI session/list 的归属键是本地路径，而移动
   * 链路请求携带 remote-agent workspaceIdentity，键不相等会恒空（实测）。existing-only：
   * 仅为看列表不拉起 Agent；runtime 未运行时抛错，由调用方按空列表处理。
   */
  async subscribe(onUpdate: (projection: RelaySessionsIndexProjection) => void): Promise<void> {
    const generation = this.generation + 1;
    await this.unsubscribe();
    if (generation !== this.generation) return;

    this.projection = new RelaySessionsIndexProjection();
    // 快照是 post-response 投递，竞态下可能先于 ACK 到达：先缓冲、拿到
    // subscriptionId 后按序放行（同 conversation；ACK 前按 id 过滤会丢整份快照）。
    this.pendingFrames = [];
    const decoder = createTopicWireDecoder<SessionsIndexTopicFrame>(
      new TopicWireFrameAssembler(sessionsIndexTopicFrameSchema),
      (frame) => {
        if (generation !== this.generation) return;
        if (this.subscriptionId === null) {
          this.pendingFrames?.push(frame);
          return;
        }
        if (frame.subscriptionId !== this.subscriptionId) return;
        this.projection?.applyFrame(frame);
        if (this.projection) this.onUpdate?.(this.projection);
      },
    );
    this.decoder = decoder;
    this.onUpdate = onUpdate;
    // 帧上游先于 subscribe RPC 建立（snapshot 是 post-response 投递，与 conversation 同序）。
    this.upstream = this.agent.onDynamicSessionsIndexFrame(this.workspace)((wire) => {
      decoder.accept(wire);
    });

    const result = await this.agent.subscribeSessionsIndexV4({
      ...this.workspace,
      runtimePolicy: "existing-only",
    });
    if (generation !== this.generation) {
      await this.agent
        .unsubscribeSessionsIndexV4({
          ...this.workspace,
          subscriptionId: result.ack.subscriptionId,
        })
        .catch(() => undefined);
      return;
    }
    this.subscriptionId = result.ack.subscriptionId;
    const pending = this.pendingFrames ?? [];
    this.pendingFrames = null;
    for (const frame of pending) {
      if (frame.subscriptionId !== this.subscriptionId) continue;
      this.projection.applyFrame(frame);
    }
    if (pending.some((frame) => frame.subscriptionId === this.subscriptionId)) {
      this.onUpdate?.(this.projection);
    }
  }

  async unsubscribe(): Promise<void> {
    this.generation++;
    const subscriptionId = this.subscriptionId;
    this.subscriptionId = null;
    this.pendingFrames = null;
    this.upstream?.dispose();
    this.upstream = null;
    this.decoder?.clear();
    this.decoder = null;
    this.onUpdate = null;
    this.projection = null;
    if (subscriptionId) {
      await this.agent
        .unsubscribeSessionsIndexV4({ ...this.workspace, subscriptionId })
        .catch(() => undefined);
    }
  }
}
