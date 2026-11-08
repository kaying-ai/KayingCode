import { RelaySessionSubmission } from "./relaySessionSubmission.js";
// 移动 V4 会话面：上游 V2 通道桥接入同一投影与命令路径。
import {
  type IMobileModelCatalogAccess,
} from "@zcode/client";
import { createCommandEnvelope, getV4ClientId } from "@zcode/client/v4/command-factory";
import {
  V4_WIRE_PROTOCOL_VERSION,
  helloMessageSchema,
  type CommandAck,
  type CommandKey,
  type CommandsQueryResult,
  type ConversationRowTarget,
  type V4ConversationFileChangesResult,
  type V4ConversationPlansResult,
} from "@zcode/shared/kayingcode-protocol-v4";
import type { KayingCodeTaskTokenUsageResult } from "@zcode/shared";
import {
  relayPendingCommands,
  type RelayPendingCommandLedger,
  type RelayReconcileReport,
} from "./relayPendingCommands.js";
import type {
  RelayConversationProjection,
  RelaySessionsIndexProjection,
} from "./relayProjection.js";
import { RelaySessionCommands } from "./relaySessionCommands.js";
import {
  RelayConversationSubscriber,
  RelaySessionsIndexSubscriber,
} from "./relayTopicSubscribers.js";
import { RelayWorkspaceConfigSubscriber } from "./relayWorkspaceConfig.js";
import type { RelayWorkspaceConfigProjection } from "./relayWorkspaceConfig.js";
import type { RelayWorkspaceTarget } from "./relayWorkspaceTarget.js";
import type { MobileAgentService } from "./mobileAgentService.js";
import { RelayAttachments } from "./relayAttachments.js";

/** 上游通道的 V4 会话面；断线后由消费方重建，订阅 ID 不复用。 */
export class RelayAgentConnection {
  private readonly agent: MobileAgentService;
  private readonly workspace: RelayWorkspaceTarget;
  private disposed = false;
  /** MOB-05 发送账本；null 供测试隔离（不登记/不结算/不对账）。 */
  private readonly pending: RelayPendingCommandLedger | null;
  private readonly conversation: RelayConversationSubscriber;
  private readonly sessionsIndex: RelaySessionsIndexSubscriber;
  private readonly workspaceConfig: RelayWorkspaceConfigSubscriber;
  private readonly sessionCommands: RelaySessionCommands;
  private readonly submission: RelaySessionSubmission;

  private constructor(
    agent: MobileAgentService,
    workspace: RelayWorkspaceTarget,
    pending: RelayPendingCommandLedger | null,
  ) {
    this.agent = agent;
    this.workspace = workspace;
    this.pending = pending;
    this.submission = new RelaySessionSubmission(
      agent,
      workspace,
      pending,
      () => this.workspaceIdentity(),
      () => this.pendingWorkspaceKey(),
    );
    this.conversation = new RelayConversationSubscriber(agent, workspace, pending);
    this.sessionsIndex = new RelaySessionsIndexSubscriber(agent, workspace);
    this.workspaceConfig = new RelayWorkspaceConfigSubscriber(agent, workspace);
    // 定序事实延迟到发送时读取：投影随 snapshot / state.updated 前进，缓存必然过期。
    this.sessionCommands = new RelaySessionCommands(agent, workspace, () => ({
      revision: this.conversation.current.revision,
      logEpoch: this.conversation.current.logEpoch,
    }));
  }

  /** 服务端 catalog 的 workspace 隔离 key（initialize 后可用）。 */
  workspaceIdentity(): string {
    return this.workspace.workspaceIdentity?.trim() || this.workspace.workspacePath;
  }

  private pendingWorkspaceKey(): string {
    return this.workspaceIdentity();
  }

  /** 会话命令面；CAS 定序与 stale 重发由它统一处理。 */
  get commands(): RelaySessionCommands {
    return this.sessionCommands;
  }

  get attachments(): RelayAttachments | null {
    return null;
  }

  workspaceTarget(): RelayWorkspaceTarget {
    return { ...this.workspace };
  }

  /** ZCode 工作区桥使用同一 V4 投影与命令面，直接注入通道 agent。 */
  static async fromAgent(
    agent: MobileAgentService,
    workspace: RelayWorkspaceTarget,
    pending: RelayPendingCommandLedger | null = relayPendingCommands,
  ): Promise<RelayAgentConnection> {
    // 通道桥的 delivery mode 由宿主 hello 决定；relay attachment 的 replayable
    // 限制不应用到此处。schema 校验仍会拒绝未知协议形状。
    helloMessageSchema.parse(await agent.helloConversationV4());
    await agent.initializeConversationV4({
      kind: "clientHello",
      protocolVersion: V4_WIRE_PROTOCOL_VERSION,
      clientId: getV4ClientId(),
      clientKind: "mobileApp",
      appVersion: "unknown",
      capabilities: { workspaceHookReviewUi: true },
    });
    return new RelayAgentConnection(agent, workspace, pending);
  }

  /** 订阅任务列表；existing-only 不拉起 Agent。 */
  async subscribeSessionsIndex(
    onUpdate: (projection: RelaySessionsIndexProjection) => void,
  ): Promise<void> {
    if (this.disposed) throw new Error("connection disposed");
    await this.sessionsIndex.subscribe(onUpdate);
  }

  async unsubscribeSessionsIndex(): Promise<void> {
    await this.sessionsIndex.unsubscribe();
  }

  /** 订阅 workspace 配置目录；模型目录由独立通道提供。 */
  async subscribeWorkspaceConfig(
    onUpdate: (projection: RelayWorkspaceConfigProjection) => void,
  ): Promise<void> {
    if (this.disposed) throw new Error("connection disposed");
    await this.workspaceConfig.subscribe(onUpdate);
  }

  async unsubscribeWorkspaceConfig(): Promise<void> {
    await this.workspaceConfig.unsubscribe();
  }

  /** relay 移动目录；ZCode 模型目录经 task 通道读取。 */
  mobileModelCatalog(): IMobileModelCatalogAccess | null {
    return null;
  }

  /** 回合文件变更（rows range 同族只读查询）：CAS 定序取当前投影水位。 */
  async fileChanges(
    sessionId: string,
    target: ConversationRowTarget,
  ): Promise<V4ConversationFileChangesResult> {
    return this.agent.conversationFileChangesV4({
      ...this.workspace,
      sessionId,
      target,
      baseRevision: this.conversation.current.revision,
      baseLogEpoch: this.conversation.current.logEpoch,
    });
  }

  async plans(sessionId: string): Promise<V4ConversationPlansResult> {
    return this.agent.conversationPlansV4({ ...this.workspace, sessionId });
  }

  async taskTokenUsage(sessionId: string): Promise<KayingCodeTaskTokenUsageResult> {
    return this.agent.getTaskTokenUsage({ ...this.workspace, sessionId });
  }

  createSession(...args: Parameters<RelaySessionSubmission["createSession"]>): Promise<string> {
    return this.submission.createSession(...args);
  }

  sendText(...args: Parameters<RelaySessionSubmission["sendText"]>): Promise<CommandAck> {
    return this.submission.sendText(...args);
  }

  async stopTurn(sessionId: string): Promise<CommandAck> {
    return this.agent.sendConversationCommandV4({
      ...this.workspace,
      envelope: createCommandEnvelope({ type: "stop", payload: {}, sessionId }),
    });
  }

  /** resolveInteraction 作答（MOB-C-006）：permission/userInput 等等待交互。 */
  async resolveInteraction(
    sessionId: string,
    interactionId: string,
    answer: {
      optionId?: string;
      freeText?: string;
      action?: "accept" | "decline" | "cancel";
      content?: Record<string, unknown>;
    },
  ): Promise<CommandAck> {
    return this.agent.sendConversationCommandV4({
      ...this.workspace,
      envelope: createCommandEnvelope({
        type: "resolveInteraction",
        payload: { interactionId, answer },
        sessionId,
      }),
    });
  }

  /**
   * rows range 回补（MOB-C-005）：取当前窗口第一行之前的更早历史并前插投影。
   * 返回服务端 hasMore，供 UI 决定是否继续显示"加载更早消息"。
   */
  async loadOlderRows(sessionId: string, limit = 30): Promise<{ hasMore: boolean }> {
    return this.conversation.loadOlderRows(sessionId, limit);
  }

  /**
   * 订阅会话流；帧先于 ACK 绑定也可能到达，因此上游订阅先于 subscribe RPC 建立
   * （与 ui transport 同序），投影只接受当前 subscriptionId 的帧。
   */
  async subscribeConversation(
    sessionId: string,
    onUpdate: (projection: RelayConversationProjection) => void,
  ): Promise<void> {
    if (this.disposed) throw new Error("connection disposed");
    await this.conversation.subscribe(sessionId, onUpdate);
  }

  /**
   * 重连对账（MOB-05）：把账本 pending 交给权威 commandsQuery 收口。
   * connection scope 将 workspace 绑定到 grant target，跨 workspace 查询不可达。
   */
  async reconcilePendingCommands(): Promise<RelayReconcileReport> {
    if (!this.pending || this.disposed) {
      return { recoveredSessionId: null, restoredDraft: null };
    }
    const query = (commands: CommandKey[]): Promise<CommandsQueryResult> =>
      this.agent.queryConversationCommandsV4({ ...this.workspace, commands });
    return this.pending.reconcile(query, this.pendingWorkspaceKey());
  }

  async unsubscribeConversation(): Promise<void> {
    await this.conversation.unsubscribe();
  }

  /** 释放本连接的订阅；底层通道生命周期由桥的 owner 管理。 */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    void this.unsubscribeConversation().catch(() => undefined);
    void this.unsubscribeSessionsIndex().catch(() => undefined);
    void this.unsubscribeWorkspaceConfig().catch(() => undefined);
  }
}
