import { createCommandEnvelope } from "@zcode/client/v4/command-factory";
import type { AttachmentRef, CommandAck } from "@zcode/shared/kayingcode-protocol-v4";
import type { MobileAgentService } from "./mobileAgentService.js";
import type { RelayWorkspaceTarget } from "./relayWorkspaceTarget.js";
import type { RelayPendingCommandLedger } from "./relayPendingCommands.js";

/** 输入提交与 pending 关联的唯一移动实现；连接 owner 只委托，不复制受理状态。 */
export class RelaySessionSubmission {
  constructor(
    private readonly agent: MobileAgentService,
    private readonly workspace: RelayWorkspaceTarget,
    private readonly pending: RelayPendingCommandLedger | null,
    private readonly workspaceIdentity: () => string,
    private readonly pendingWorkspaceKey: () => string,
  ) {}
  /** 新建会话；普通模式首条输入随 create 提交，草稿配置随创建进入。 */
  async createSession(
    firstText?: string,
    config?: {
      provider?: string;
      model?: string;
      thought?: string;
      mode?: string;
    },
    attachments?: readonly AttachmentRef[],
  ): Promise<string> {
    const envelope = createCommandEnvelope({
      type: "createSession",
      payload: {
        workspaceId: this.workspaceIdentity(),
        ...(firstText
          ? {
              firstInput: {
                text: firstText,
                ...(attachments?.length ? { attachments: [...attachments] } : {}),
              },
            }
          : {}),
        ...(config && Object.keys(config).length > 0 ? { config } : {}),
      },
      sessionId: null,
    });
    // 先登记后上行；ACK 未知时保留 commandId 给重连对账，避免新 ID 重发。
    this.pending?.record({
      commandId: envelope.commandId,
      kind: "createSession",
      sessionId: null,
      workspaceId: this.pendingWorkspaceKey(),
      text: firstText ?? "",
    });
    const ack = await this.agent.sendConversationCommandV4({
      ...this.workspace,
      envelope,
    });
    // duplicate 是同 commandId 的回放缓存结果：createSession 语义下等价受理。
    if (
      (ack.status !== "accepted" && ack.status !== "duplicate") ||
      ack.result?.type !== "createSession"
    ) {
      this.pending?.acknowledge(envelope.commandId, ack);
      throw new Error(
        ack.message ?? `createSession rejected: ${ack.status} ${ack.reasonCode ?? ""}`,
      );
    }
    // sessionId 已随 ACK 权威绑定：立即结算，首条输入行经订阅回显。
    this.pending?.settle(envelope.commandId);
    return ack.result.sessionId;
  }

  /** 发送文本；选择立即发送时带上用户确认过的队列 ID，拒绝并发新增项。 */
  async sendText(
    sessionId: string,
    text: string,
    options?: {
      heldQueueDisposition?: "clearQueueAndSend" | "keepQueueAndSend";
      expectedHeldQueueItemIds?: string[];
      attachments?: readonly AttachmentRef[];
    },
  ): Promise<CommandAck> {
    const envelope = createCommandEnvelope({
      type: "sendText",
      payload: {
        text,
        ...(options?.attachments?.length ? { attachments: [...options.attachments] } : {}),
        ...(options?.heldQueueDisposition
          ? { heldQueueDisposition: options.heldQueueDisposition }
          : {}),
        ...(options?.expectedHeldQueueItemIds
          ? { expectedHeldQueueItemIds: options.expectedHeldQueueItemIds }
          : {}),
      },
      sessionId,
    });
    // 先登记后上行（MOB-05）。ACK 未知（断线/超时）时条目保留，由重连对账收口。
    this.pending?.record({
      commandId: envelope.commandId,
      kind: "sendText",
      sessionId,
      workspaceId: this.pendingWorkspaceKey(),
      text,
    });
    const ack = await this.agent.sendConversationCommandV4({
      ...this.workspace,
      envelope,
    });
    this.pending?.acknowledge(envelope.commandId, ack);
    return ack;
  }
}
