import { z } from "zod";
import { toToolJsonSchema } from "./json-schema.js";

export const TOOL_SEARCH_NAME = "ToolSearch";
export const LOCAL_TOOL_SEARCH_NAME = "LocalToolSearch";
export const ToolSearchModeSchema = z.enum(["auto", "native", "local", "off"]);
export type ToolSearchMode = z.infer<typeof ToolSearchModeSchema>;
export type ResolvedToolSearchMode = Exclude<ToolSearchMode, "auto">;
export function toolSearchNameForMode(mode: ResolvedToolSearchMode): string {
  return mode === "local" ? LOCAL_TOOL_SEARCH_NAME : TOOL_SEARCH_NAME;
}
export function isToolSearchName(name: string | undefined): boolean {
  return name === TOOL_SEARCH_NAME || name === LOCAL_TOOL_SEARCH_NAME;
}
export const TOOL_SEARCH_DEFAULT_RESULTS = 5;
export const TOOL_SEARCH_BETA = "advanced-tool-use-2025-11-20";
// 连接中/失败的 MCP server 诊断：ToolSearch 未命中时随结果返回给模型。
export const ToolSearchMcpFailureSchema = z.object({
  name: z.string(),
  errorCode: z.string().optional(),
  error: z.string().optional(),
});
export const ToolSearchMcpStateSchema = z.object({
  pending: z.array(z.string()),
  /** 需要用户授权后才能使用的 server；缺席等同空列表。 */
  needsAuth: z.array(z.string()).optional(),
  failed: z.array(ToolSearchMcpFailureSchema),
});
export type ToolSearchMcpState = z.infer<typeof ToolSearchMcpStateSchema>;
export const ToolSearchAnnouncementSchema = z
  .object({
    addedNames: z.array(z.string().min(1)),
    removedNames: z.array(z.string().min(1)),
    readdedNames: z.array(z.string().min(1)),
  })
  .strict()
  .refine((delta) => delta.readdedNames.every((name) => delta.addedNames.includes(name)), {
    message: "Readded tool names must be included in addedNames",
  });
export const ToolReferenceContentSchema = z
  .object({
    type: z.literal("tool_reference"),
    toolName: z.string().min(1),
  })
  .strict();
export type ModelToolReferenceContentBlock = z.infer<typeof ToolReferenceContentSchema>;
export const PersistedToolSearchContentSchema = z
  .array(
    z.union([
      z.object({ type: z.literal("text"), text: z.string() }).strict(),
      ToolReferenceContentSchema,
    ]),
  )
  .min(1);
export const ToolSearchInputSchema = z.object({
  query: z
    .string()
    .describe(
      'Query to find deferred tools. Use "select:<tool_name>" for direct selection, or keywords to search. Regular expressions are not supported.',
    ),
  max_results: z
    .number()
    .optional()
    .default(TOOL_SEARCH_DEFAULT_RESULTS)
    .describe("Maximum number of results to return (default: 5)"),
});
export const ToolSearchOutputSchema = z.object({
  matches: z.array(z.string()),
  query: z.string(),
  total_deferred_tools: z.number(),
  pending_mcp_servers: z.array(z.string()).optional(),
  failed_mcp_servers: z.array(ToolSearchMcpFailureSchema).optional(),
});
export const ToolSearchInputJsonSchema = toToolJsonSchema(ToolSearchInputSchema);
export const ToolSearchOutputJsonSchema = toToolJsonSchema(ToolSearchOutputSchema);
export interface ToolSearchCapability {
  readonly protocolSupported: boolean;
  readonly defaultEnabled: boolean;
}
export interface ToolSearchCandidate {
  readonly name: string;
  readonly aliases?: readonly string[];
  readonly mcp?: { readonly serverName: string; readonly toolName: string };
  readonly description?: string;
  readonly searchHint?: string;
  readonly deferred: boolean;
}
export interface ToolSearchLiveView {
  readonly catalog: readonly ToolSearchCandidate[];
  readonly pending: readonly string[];
  readonly failed: ToolSearchMcpState["failed"];
}
export interface ToolSearchExecutionContext {
  readonly mode: ResolvedToolSearchMode;
  readonly enabled: boolean;
  readonly catalog: readonly ToolSearchCandidate[];
  readonly discovered: ReadonlySet<string>;
  /**
   * 当前会话的实时目录投影：MCP server 在 step 之后连接/断线时以它为准，避免用过期启动快照。
   * 缺席时按构建请求时的 catalog 处理（compact 等不经过 turn loop 的请求）。
   */
  readonly readLatest?: () => ToolSearchLiveView;
  /** 搜索未命中且目标 server 仍在连接时等待其首次连接；缺席表示不等待。 */
  readonly waitForPending?: (
    servers: readonly string[],
    timeoutMs: number,
    signal?: AbortSignal,
  ) => Promise<void>;
}
