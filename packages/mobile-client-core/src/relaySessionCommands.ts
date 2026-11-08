// V4 会话命令面（聊天页对齐批次）：把 UI 需要的会话操作收敛到一处，统一处理
// CAS 定序（baseRevision / baseLogEpoch）与 stale 一次性重发。
//
// 定序事实每次发送都从当前投影读取，不缓存——投影随 snapshot / state.updated 前进，
// 缓存一份必然在长会话里过期。stale 表示定序已过期（如期间插入了其他命令），
// 此时用最新水位重签同一条命令：commandId 保持不变，服务端幂等表据此判重，
// 重新签发不会造成二次执行。
import { getV4ClientId } from "@zcode/client/v4/command-factory";
import type { MobileAgentService } from "./mobileAgentService.js";
import { uuidv7 } from "@zcode/shared";
import {
  COMMANDS_REQUIRING_BASE_REVISION,
  ROW_TARGETING_COMMANDS,
  type CommandAck,
  type CommandEnvelope,
  type CommandPayloadMap,
  type CommandType,
} from "@zcode/shared/kayingcode-protocol-v4";
import type { RelayWorkspaceTarget } from "./relayWorkspaceTarget.js";

/** 定序事实：当前投影的最新水位。 */
export interface RelayCommandOrdinals {
  revision: number;
  logEpoch: string;
}

type RowTarget = CommandPayloadMap["retryTurn"]["target"];

/** 两种移动壳共用 maintenance slash 语义，防止把 /compact 当普通模型输入。 */
export async function runMobileSlashCommand(
  commands: RelaySessionCommands,
  sessionId: string,
  text: string,
): Promise<boolean> {
  let operation: Promise<CommandAck>;
  if (text === "/compact" || text.startsWith("/compact ")) operation = commands.compact(sessionId);
  else if (text === "/goal" || text.startsWith("/goal ")) {
    // 必须匹配完整命令词；旧 startsWith('/goal') 会误吞 /goals 等自定义命令。
    const rest = text.slice(5).trim();
    if (!rest) return false;
    operation =
      rest === "pause"
        ? commands.pauseGoal(sessionId)
        : rest === "resume"
          ? commands.resumeGoal(sessionId)
          : commands.sendGoalCommand(sessionId, { text: rest, displayText: `/goal ${rest}` });
  } else return false;
  const ack = await operation;
  if (!["accepted", "duplicate", "noop"].includes(ack.status))
    throw new Error(ack.message ?? ack.reasonCode ?? "relay.command.rejected");
  return true;
}

/**
 * 一条 attachment 上的会话命令发送器。
 * 与 RelayAgentConnection 的关系：连接负责链路与订阅，本类只负责命令的构造与定序。
 */
export class RelaySessionCommands {
  constructor(
    private readonly agent: MobileAgentService,
    private readonly workspace: RelayWorkspaceTarget,
    private readonly ordinals: () => RelayCommandOrdinals,
  ) {}

  /** 压缩上下文；idle 立即执行，busy 时进入 FIFO（非 CAS 命令）。 */
  compact(sessionId: string): Promise<CommandAck> {
    return this.send("compact", {}, sessionId);
  }

  /**
   * 停止当前前台工作。
   * expectedForegroundExecutionId 来自 control.activeWorks：CLI 用它拒绝会误杀后续
   * 无关执行的迟到 Stop，因此有值时必须带上。
   */
  stop(sessionId: string, expectedForegroundExecutionId?: string): Promise<CommandAck> {
    return this.send(
      "stop",
      expectedForegroundExecutionId ? { expectedForegroundExecutionId } : {},
      sessionId,
    );
  }

  /** 目标命令：start/pause/resume 共用一个命令面，语义由 text 与命令体决定。 */
  sendGoalCommand(
    sessionId: string,
    payload: CommandPayloadMap["sendGoalCommand"],
  ): Promise<CommandAck> {
    return this.send("sendGoalCommand", payload, sessionId);
  }

  pauseGoal(sessionId: string): Promise<CommandAck> {
    return this.send("pauseGoal", {}, sessionId);
  }

  resumeGoal(sessionId: string): Promise<CommandAck> {
    return this.send("resumeGoal", {}, sessionId);
  }

  /** 模型与思考档切换。 */
  switchModelConfig(
    sessionId: string,
    payload: CommandPayloadMap["switchModelConfig"],
  ): Promise<CommandAck> {
    return this.send("switchModelConfig", payload, sessionId);
  }

  /** 协作模式：auto 非用户可切，值域由协议收窄。 */
  switchCollaborationMode(
    sessionId: string,
    mode: CommandPayloadMap["switchCollaborationMode"]["mode"],
  ): Promise<CommandAck> {
    return this.send("switchCollaborationMode", { mode }, sessionId);
  }

  /** 后续输入的默认去向（排队 / 引导）。 */
  setFollowupMode(
    sessionId: string,
    mode: CommandPayloadMap["setFollowupMode"]["mode"],
  ): Promise<CommandAck> {
    return this.send("setFollowupMode", { mode }, sessionId);
  }

  retryTurn(sessionId: string, target: RowTarget): Promise<CommandAck> {
    return this.send("retryTurn", { target }, sessionId);
  }

  forkAssistant(sessionId: string, target: RowTarget): Promise<CommandAck> {
    return this.send("forkAssistant", { target }, sessionId);
  }

  applyFileRewind(sessionId: string, target: RowTarget): Promise<CommandAck> {
    return this.send("applyFileRewind", { target }, sessionId);
  }

  editUserQuery(
    sessionId: string,
    payload: CommandPayloadMap["editUserQuery"],
  ): Promise<CommandAck> {
    return this.send("editUserQuery", payload, sessionId);
  }

  setAssistantFeedback(
    sessionId: string,
    target: RowTarget,
    feedback: "like" | "dislike" | null,
  ): Promise<CommandAck> {
    return this.send("setAssistantFeedback", { target, feedback }, sessionId);
  }

  sendQueuedNow(sessionId: string, queueItemId: string): Promise<CommandAck> {
    return this.send("sendQueuedNow", { queueItemId }, sessionId);
  }

  editQueueItem(sessionId: string, queueItemId: string, newText: string): Promise<CommandAck> {
    return this.send("editQueueItem", { queueItemId, newText }, sessionId);
  }

  deleteQueueItem(sessionId: string, queueItemId: string): Promise<CommandAck> {
    return this.send("deleteQueueItem", { queueItemId }, sessionId);
  }

  /** beforeQueueItemId = null 表示移到队尾。 */
  reorderQueueItem(
    sessionId: string,
    queueItemId: string,
    beforeQueueItemId: string | null,
  ): Promise<CommandAck> {
    return this.send("reorderQueueItem", { queueItemId, beforeQueueItemId }, sessionId);
  }

  setAutoDrain(sessionId: string, autoDrain: boolean): Promise<CommandAck> {
    return this.send("setAutoDrain", { autoDrain }, sessionId);
  }

  /** 会话标题（titleSource 由服务端置 custom，不再被自动标题覆盖）。 */
  renameSession(sessionId: string, title: string): Promise<CommandAck> {
    return this.send("renameSession", { title }, sessionId);
  }

  deleteSession(sessionId: string): Promise<CommandAck> {
    return this.send("deleteSession", {}, sessionId);
  }

  // ── 发送与定序 ──

  private async send(type: CommandType, payload: unknown, sessionId: string): Promise<CommandAck> {
    const envelope = this.build(type, payload, sessionId);
    const ack = await this.dispatch(envelope);
    if (ack.status !== "stale") return ack;
    return this.dispatch(this.resign(envelope));
  }

  private dispatch(envelope: CommandEnvelope): Promise<CommandAck> {
    return this.agent.sendConversationCommandV4({ ...this.workspace, envelope });
  }

  private build(type: CommandType, payload: unknown, sessionId: string): CommandEnvelope {
    const envelope: CommandEnvelope = {
      commandId: uuidv7(),
      clientId: getV4ClientId(),
      sessionId,
      type,
      payload,
      issuedAt: Date.now(),
    };
    this.stampOrdinals(envelope, type);
    return envelope;
  }

  /** 重签：只刷新 CAS 字段，commandId / payload / issuedAt 原样保留。 */
  private resign(envelope: CommandEnvelope): CommandEnvelope {
    const next: CommandEnvelope = { ...envelope };
    delete next.baseRevision;
    delete next.baseLogEpoch;
    this.stampOrdinals(next, envelope.type);
    return next;
  }

  private stampOrdinals(envelope: CommandEnvelope, type: CommandType): void {
    const { revision, logEpoch } = this.ordinals();
    if (COMMANDS_REQUIRING_BASE_REVISION.has(type)) envelope.baseRevision = revision;
    if (ROW_TARGETING_COMMANDS.has(type)) envelope.baseLogEpoch = logEpoch;
  }
}
