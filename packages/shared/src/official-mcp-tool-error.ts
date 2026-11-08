/** 官方 MCP 工具错误码（协议展示用）；localrun 不提供官方 Server MCP。 */
export const OFFICIAL_MCP_TOOL_ERROR_CODES = ["quota_exceeded", "coding_plan_required"] as const;

export type OfficialMcpToolErrorCode = (typeof OFFICIAL_MCP_TOOL_ERROR_CODES)[number];

export interface OfficialMcpToolError {
  code: OfficialMcpToolErrorCode;
  message?: string;
}

export function parseOfficialMcpToolError(_text: string): OfficialMcpToolError | undefined {
  return undefined;
}
