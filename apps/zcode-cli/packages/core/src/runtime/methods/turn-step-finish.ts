import { createPartId } from "../deps.js";
import type { MessageId, TraceContext } from "../deps.js";
import { toTokenUsageInfo } from "../helpers/index.js";
import type { AgentRuntimeInternal } from "../internal.js";
import type { RuntimeModelTextResult } from "../types.js";
import type { RegularTurnLoopState } from "./turn-loop-state.js";
import { committedToolSearchDelivery } from "./turn-output-token-continuation.js";

export async function persistToolModelStepFinish(
  runtime: AgentRuntimeInternal,
  state: RegularTurnLoopState,
  options: {
    assistantCreatedAt: number;
    assistantMessageId: MessageId;
    modelTraceContext: TraceContext;
    result: RuntimeModelTextResult;
  },
): Promise<void> {
  const model = state.model;
  if (!model) {
    throw new Error("Model-backed turn step finish requires the loop Model");
  }
  await runtime.persistPart(
    {
      id: createPartId(),
      sessionID: runtime.sessionId,
      messageID: options.assistantMessageId,
      type: "step-finish",
      reason: options.result.finishReason,
      cost: 0,
      tokens: toTokenUsageInfo(options.result.usage),
    },
    options.modelTraceContext,
  );
  await runtime.persistAssistantMessage(
    options.assistantMessageId,
    state.currentUserMessageId,
    options.assistantCreatedAt,
    {
      toolSearchDelivery: committedToolSearchDelivery(state.turnRequestState),
      completed: Date.now(),
      finish: options.result.finishReason,
      tokens: toTokenUsageInfo(options.result.usage),
      // 签名修复成功的那一步要落盘标记；冷恢复据此对同一条消息拆出的第一条 assistant 做同样处理。
      signedReasoningReset: options.result.signedReasoningReset,
    },
    options.modelTraceContext,
    model,
  );
}
