// ZCode 桥上的移动 V4 服务端口：只负责通道 RPC 与动态事件，不持有投影或订阅状态。
import {
  conversationTopicWireCandidateSchema,
  sessionsIndexTopicWireCandidateSchema,
  workspaceConfigTopicWireCandidateSchema,
} from "@zcode/shared/kayingcode-protocol-v4";
import type { MobileAgentService } from "../mobileAgentService.js";
import type { RelayWorkspaceTarget } from "../relayWorkspaceTarget.js";
import type { BridgeSession } from "./bridgeSession.js";
import { Channels } from "./channelClient.js";

type AgentMethod = Exclude<keyof MobileAgentService, `onDynamic${string}`>;

export class ChannelBackedKayingCodeAgentService implements MobileAgentService {
  constructor(
    private readonly bridge: BridgeSession,
    private readonly workspace: RelayWorkspaceTarget,
  ) {}

  private async call<T>(method: AgentMethod, args: unknown[], timeoutMs = 30_000): Promise<T> {
    await this.bridge.waitHealthy();
    return this.bridge.channels.call(Channels.zcodeAgent, method, args, timeoutMs) as Promise<T>;
  }

  private scoped(params: object): Record<string, unknown> {
    return {
      ...params,
      workspacePath: this.workspace.workspacePath,
      ...(this.workspace.workspaceIdentity
        ? { workspaceIdentity: this.workspace.workspaceIdentity }
        : {}),
    };
  }

  helloConversationV4: MobileAgentService["helloConversationV4"] = () =>
    this.call("helloConversationV4", []);

  initializeConversationV4: MobileAgentService["initializeConversationV4"] = (hello) =>
    this.call("initializeConversationV4", [hello]);

  subscribeConversationV4: MobileAgentService["subscribeConversationV4"] = (params) =>
    this.call("subscribeConversationV4", [this.scoped(params)], 60_000);

  unsubscribeConversationV4: MobileAgentService["unsubscribeConversationV4"] = (params) =>
    this.call("unsubscribeConversationV4", [this.scoped(params)]);

  resyncConversationV4: MobileAgentService["resyncConversationV4"] = (params) =>
    this.call("resyncConversationV4", [this.scoped(params)]);

  conversationRowsRangeV4: MobileAgentService["conversationRowsRangeV4"] = (params) =>
    this.call("conversationRowsRangeV4", [this.scoped(params)]);

  conversationPlansV4: MobileAgentService["conversationPlansV4"] = (params) =>
    this.call("conversationPlansV4", [this.scoped(params)]);

  conversationFileChangesV4: MobileAgentService["conversationFileChangesV4"] = (params) =>
    this.call("conversationFileChangesV4", [this.scoped(params)]);

  sendConversationCommandV4: MobileAgentService["sendConversationCommandV4"] = (params) =>
    this.call("sendConversationCommandV4", [this.scoped(params)], 60_000);

  queryConversationCommandsV4: MobileAgentService["queryConversationCommandsV4"] = (params) =>
    this.call("queryConversationCommandsV4", [this.scoped(params)]);

  subscribeSessionsIndexV4: MobileAgentService["subscribeSessionsIndexV4"] = (params) =>
    this.call("subscribeSessionsIndexV4", [this.scoped(params)], 60_000);

  unsubscribeSessionsIndexV4: MobileAgentService["unsubscribeSessionsIndexV4"] = (params) =>
    this.call("unsubscribeSessionsIndexV4", [this.scoped(params)]);

  resyncSessionsIndexV4: MobileAgentService["resyncSessionsIndexV4"] = (params) =>
    this.call("resyncSessionsIndexV4", [this.scoped(params)]);

  subscribeWorkspaceConfigV4: MobileAgentService["subscribeWorkspaceConfigV4"] = (params) =>
    this.call("subscribeWorkspaceConfigV4", [this.scoped(params)], 60_000);

  unsubscribeWorkspaceConfigV4: MobileAgentService["unsubscribeWorkspaceConfigV4"] = (params) =>
    this.call("unsubscribeWorkspaceConfigV4", [this.scoped(params)]);

  resyncWorkspaceConfigV4: MobileAgentService["resyncWorkspaceConfigV4"] = (params) =>
    this.call("resyncWorkspaceConfigV4", [this.scoped(params)]);

  getTaskTokenUsage: MobileAgentService["getTaskTokenUsage"] = (params) =>
    this.call("getTaskTokenUsage", [this.scoped(params)]);

  onDynamicConversationFrame: MobileAgentService["onDynamicConversationFrame"] =
    (_params) => (listener) => {
      const cancel = this.bridge.channels.addEventListener(
        Channels.zcodeAgent,
        "onDynamicConversationFrame",
        (raw) => {
          const parsed = conversationTopicWireCandidateSchema.safeParse(raw);
          if (parsed.success) listener(parsed.data);
        },
        this.scoped({}),
      );
      return { dispose: cancel };
    };

  onDynamicSessionsIndexFrame: MobileAgentService["onDynamicSessionsIndexFrame"] =
    (_params) => (listener) => {
      const cancel = this.bridge.channels.addEventListener(
        Channels.zcodeAgent,
        "onDynamicSessionsIndexFrame",
        (raw) => {
          const parsed = sessionsIndexTopicWireCandidateSchema.safeParse(raw);
          if (parsed.success) listener(parsed.data);
        },
        this.scoped({}),
      );
      return { dispose: cancel };
    };

  onDynamicWorkspaceConfigFrame: MobileAgentService["onDynamicWorkspaceConfigFrame"] =
    (_params) => (listener) => {
      const cancel = this.bridge.channels.addEventListener(
        Channels.zcodeAgent,
        "onDynamicWorkspaceConfigFrame",
        (raw) => {
          const parsed = workspaceConfigTopicWireCandidateSchema.safeParse(raw);
          if (parsed.success) listener(parsed.data);
        },
        this.scoped({}),
      );
      return { dispose: cancel };
    };
}
