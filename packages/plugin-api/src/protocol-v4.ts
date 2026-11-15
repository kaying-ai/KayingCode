// @zcode-dev/plugin-api/protocol-v4（docs/plugins/extension-host.md §17.9）：完整行、context 组成与生成速率。
// 版本跟 v4 协议走（清单 protocols.rows）。
export type {
  ArtifactRow,
  AssistantTextRow,
  ContextComposition,
  ContextCompositionCategory,
  ContextCompositionCategoryId,
  ContextCompositionItem,
  ContextCompositionPhase,
  ContextCompositionToolOrigin,
  ContextCompositionUsageSource,
  ConversationInputSource,
  HookInvocationRow,
  PendingInteraction,
  PermissionRequestPayload,
  ReasoningRow,
  SubagentRow,
  TimelineMarkerRow,
  ToolCallRow,
  TurnHeaderRow,
  UnreadableConversationRow,
  UserInputQuestionPayload,
  UserInputRequestPayload,
  UserInputRow,
  WireConversationRow,
  UnreadableConversationRow as UnreadableConversationRowBase,
} from "@zcode/shared/kayingcode-protocol-v4";
import type {
  WireConversationRow,
  UnreadableConversationRow as UnreadableConversationRowBase,
} from "@zcode/shared/kayingcode-protocol-v4";
/** 展示行：wire 行或读不懂时的占位行（与宿主协议同一语义）。 */
export type ConversationRow = WireConversationRow | UnreadableConversationRowBase;
export type ConversationRowKind = ConversationRow["kind"];
// 定义在 extension-host-protocol（ctx.models.onDidGenerate 的事件）；根入口导出的是同一个类型。
export type { GenerationMetrics } from "@zcode/shared/extension-host";
