import { CoreErrorType, createCoreError } from "@zcode/contracts";
import type { ExecutableToolCall, ToolEntry } from "../types.js";

export type LiveEntryResolution =
  | { status: "ready"; entry: ToolEntry }
  | { status: "failed"; error: Error; cancelled: boolean; cause?: unknown };

/**
 * 缓存 advertisement entry 执行前换成 live entry；不可用/异常统一收敛为可重试的工具错误。
 * 调用方负责对返回的 live entry 重新套用本轮模型契约投影。
 */
export async function resolveLiveToolEntry(
  resolveForExecution: NonNullable<ToolEntry["resolveForExecution"]>,
  toolCall: ExecutableToolCall,
  signal: AbortSignal | undefined,
): Promise<LiveEntryResolution> {
  try {
    const resolution = await resolveForExecution({ signal });
    if (resolution.status === "ready") return resolution;
    return {
      status: "failed",
      cancelled: false,
      error: createLiveEntryUnavailableError(toolCall, resolution.message),
    };
  } catch (error) {
    const cancelled = signal?.aborted === true;
    return {
      status: "failed",
      cancelled,
      cause: error,
      error: cancelled
        ? createCoreError(CoreErrorType.ToolCancelled, "Tool execution cancelled")
        : createLiveEntryUnavailableError(toolCall, "Tool is not available", error),
    };
  }
}

function createLiveEntryUnavailableError(
  toolCall: ExecutableToolCall,
  message: string,
  cause?: unknown,
): Error {
  return createCoreError(CoreErrorType.ToolExecutionFailed, message, {
    ...(cause === undefined
      ? {}
      : { cause: cause instanceof Error ? cause : new Error(String(cause)) }),
    context: { toolCallId: toolCall.id, toolName: toolCall.name },
    recoverable: true,
    retryable: true,
  });
}
