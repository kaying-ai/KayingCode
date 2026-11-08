import type { IKayingCodeAgentService } from "@zcode/services";

/** 移动 V4 投影与命令真正使用的服务面；relay 与 ZCode 通道共用。 */
export type MobileAgentService = Pick<
  IKayingCodeAgentService,
  | "helloConversationV4"
  | "initializeConversationV4"
  | "subscribeConversationV4"
  | "unsubscribeConversationV4"
  | "resyncConversationV4"
  | "conversationRowsRangeV4"
  | "conversationPlansV4"
  | "conversationFileChangesV4"
  | "sendConversationCommandV4"
  | "queryConversationCommandsV4"
  | "onDynamicConversationFrame"
  | "subscribeSessionsIndexV4"
  | "unsubscribeSessionsIndexV4"
  | "resyncSessionsIndexV4"
  | "onDynamicSessionsIndexFrame"
  | "subscribeWorkspaceConfigV4"
  | "unsubscribeWorkspaceConfigV4"
  | "resyncWorkspaceConfigV4"
  | "onDynamicWorkspaceConfigFrame"
  | "getTaskTokenUsage"
>;
