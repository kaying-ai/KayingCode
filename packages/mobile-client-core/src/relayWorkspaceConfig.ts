// workspace-config topic 的消费侧投影与订阅（聊天页对齐批次）。
//
// 移动 attachment 只注册三个 channel：agent / task / 移动模型目录。Node 侧的
// workspace-config 快照只发布 mode 与 slash 目录（模型目录由 Host Registry View 持有，
// 经 kayingcode-mobile-model-catalog 逐字段脱敏下发），因此「模型 / 思考档 / 模式 / 斜杠」
// 的可选项是两条来源拼起来的，页面不得只读其中一路。
//
// 与 conversation / sessions-index 同构：conflated 整体替换（绝不深合并），
// 且帧可能先于 subscribe ACK 到达，必须先缓冲再按 subscriptionId 放行。
import { createTopicWireDecoder } from "@zcode/client/v4/topic-wire-decoder";
import type { MobileAgentService } from "./mobileAgentService.js";
import {
  TopicWireFrameAssembler,
  workspaceConfigTopicFrameSchema,
  type WorkspaceConfigOption,
  type WorkspaceConfigState,
  type WorkspaceConfigTopicFrame,
  type WorkspaceSlashCommand,
} from "@zcode/shared/kayingcode-protocol-v4";
import type { RelayWorkspaceTarget } from "./relayWorkspaceTarget.js";

/** workspace 级配置目录投影：整体替换，不做字段级合并。 */
export class RelayWorkspaceConfigProjection {
  logEpoch = "";
  configOptions: WorkspaceConfigOption[] = [];
  slashCommands: WorkspaceSlashCommand[] = [];

  applyFrame(frame: WorkspaceConfigTopicFrame): void {
    if (frame.payload.kind === "snapshot") {
      this.logEpoch = frame.payload.snapshot.logEpoch;
      this.applyState(frame.payload.snapshot.config);
      return;
    }
    for (const delta of frame.payload.deltas) {
      if (delta.op === "config.updated") this.applyState(delta.config);
    }
  }

  /** 按 id 取配置项；Node 未发布该 id 时返回 null（页面按"不可选"处理）。 */
  option(id: string): WorkspaceConfigOption | null {
    return this.configOptions.find((item) => item.id === id) ?? null;
  }

  private applyState(state: WorkspaceConfigState): void {
    this.configOptions = [...state.configOptions];
    this.slashCommands = [...state.slashCommands];
  }
}

/**
 * workspace 级配置目录订阅者。与另两个 topic 同序：先挂帧上游、再发 subscribe，
 * 期间到达的帧先缓冲，拿到 subscriptionId 后按序放行。
 */
export class RelayWorkspaceConfigSubscriber {
  private generation = 0;
  private readonly agent: MobileAgentService;
  private readonly workspace: RelayWorkspaceTarget;
  private projection: RelayWorkspaceConfigProjection | null = null;
  private upstream: { dispose(): void } | null = null;
  private subscriptionId: string | null = null;
  private pendingFrames: WorkspaceConfigTopicFrame[] | null = null;
  private decoder: ReturnType<typeof createTopicWireDecoder<WorkspaceConfigTopicFrame>> | null =
    null;
  private onUpdate: ((projection: RelayWorkspaceConfigProjection) => void) | null = null;

  constructor(agent: MobileAgentService, workspace: RelayWorkspaceTarget) {
    this.agent = agent;
    this.workspace = workspace;
  }

  get current(): RelayWorkspaceConfigProjection | null {
    return this.projection;
  }

  async subscribe(onUpdate: (projection: RelayWorkspaceConfigProjection) => void): Promise<void> {
    const generation = this.generation + 1;
    await this.unsubscribe();
    if (generation !== this.generation) return;

    this.projection = new RelayWorkspaceConfigProjection();
    this.pendingFrames = [];
    const decoder = createTopicWireDecoder<WorkspaceConfigTopicFrame>(
      new TopicWireFrameAssembler(workspaceConfigTopicFrameSchema),
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
    this.upstream = this.agent.onDynamicWorkspaceConfigFrame(this.workspace)((wire) => {
      decoder.accept(wire);
    });

    const result = await this.agent.subscribeWorkspaceConfigV4({ ...this.workspace });
    if (generation !== this.generation) {
      await this.agent
        .unsubscribeWorkspaceConfigV4({
          ...this.workspace,
          subscriptionId: result.ack.subscriptionId,
        })
        .catch(() => undefined);
      return;
    }
    this.subscriptionId = result.ack.subscriptionId;
    const pending = this.pendingFrames ?? [];
    this.pendingFrames = null;
    let applied = false;
    for (const frame of pending) {
      if (frame.subscriptionId !== this.subscriptionId) continue;
      this.projection?.applyFrame(frame);
      applied = true;
    }
    if (applied) this.onUpdate?.(this.projection);
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
        .unsubscribeWorkspaceConfigV4({ ...this.workspace, subscriptionId })
        .catch(() => undefined);
    }
  }
}
