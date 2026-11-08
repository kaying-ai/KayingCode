/** Runtime-neutral KayingForTaptap tool contract shared by the Pi adapter and tests. */
export interface KayingForTaptapToolContext {
  sessionId?: string;
  toolCallId?: string;
  workspacePath?: string;
  signal?: AbortSignal;
}

export interface KayingForTaptapTool<TInput = unknown, TOutput = unknown> {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (input: TInput, context?: KayingForTaptapToolContext) => Promise<TOutput> | TOutput;
}
