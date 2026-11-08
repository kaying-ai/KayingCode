/**
 * KayingCode.localrun：无官方 Server MCP 账号鉴权。
 * 仅保留协议 schema 所需的失败原因枚举与 origin 校验 stub（恒不信任）。
 */

export const KAYINGCODE_OFFICIAL_MCP_AUTH_TYPE = "kayingcode_official" as const;
export const KAYINGCODE_OFFICIAL_MCP_AUTH_PROVIDER_JWT_TOKEN = "jwt_token" as const;

export const OFFICIAL_MCP_AUTH_HEADER_NAMES = {
  authorization: "Authorization",
  bigmodelAuthorization: "X-Bigmodel-Authorization",
  bigmodelTargetType: "Bigmodel-Target-Type",
  codingPlanApiKey: "X-Coding-Plan-Api-Key",
} as const;

export const OFFICIAL_MCP_AUTH_META_KEY = "com.kayingcode/official-mcp-auth" as const;

export type OfficialMcpTargetType = "PERSONAL" | "TEAM";

export const OFFICIAL_MCP_AUTH_FAILURE_REASONS = [
  "official_auth_unavailable",
  "official_auth_plan_required",
] as const;

export type OfficialMcpAuthFailureReason = (typeof OFFICIAL_MCP_AUTH_FAILURE_REASONS)[number];

export const OFFICIAL_MCP_AUTH_PORT_FAILURE_REASONS = [
  ...OFFICIAL_MCP_AUTH_FAILURE_REASONS,
  "official_auth_origin_untrusted",
  "official_auth_bad_request",
] as const;

export type OfficialMcpAuthFailureKind =
  | "official_auth_unavailable"
  | "official_auth_plan_required"
  | "official_auth_origin_untrusted"
  | "official_auth_bad_request";

export type OfficialMcpAuthPortFailureReason =
  (typeof OFFICIAL_MCP_AUTH_PORT_FAILURE_REASONS)[number];

export const OFFICIAL_MCP_DEV_TRUSTED_ORIGINS_ENV = "KAYINGCODE_OFFICIAL_MCP_DEV_TRUSTED_ORIGINS";
export const KAYINGCODE_WORKSPACE_IDENTITY_ENV = "KAYINGCODE_WORKSPACE_IDENTITY";

export function summarizeOfficialMcpIdentityHeaders(
  headers: Record<string, string>,
): Record<string, string> {
  const summary: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    summary[name] = value ? "[redacted]" : "";
  }
  return summary;
}

export interface OfficialMcpTrustResult {
  trusted: boolean;
  detail?: string;
}

export interface IsOfficialMcpOriginTrustedInput {
  pluginId: string;
  mcpKey: string;
  origin: string;
}

/** KayingCode.localrun：无官方 MCP，默认不信任任何 origin。 */
export async function isOfficialMcpOriginTrusted(
  _input: IsOfficialMcpOriginTrustedInput,
): Promise<OfficialMcpTrustResult> {
  return { trusted: false, detail: "official_mcp_disabled" };
}

export interface OfficialMcpTrustedOriginRegistry {
  isTrusted(input: IsOfficialMcpOriginTrustedInput): Promise<OfficialMcpTrustResult>;
}

export interface CreateOfficialMcpTrustedOriginRegistryOptions {
  devTrustedOriginsRaw?: string;
  resolveKayingCodeApiOrigin?: () => unknown;
}

export function createOfficialMcpTrustedOriginRegistry(
  _options: CreateOfficialMcpTrustedOriginRegistryOptions,
): OfficialMcpTrustedOriginRegistry {
  return {
    isTrusted: async () => ({ trusted: false, reason: "official_mcp_disabled" }),
  };
}

export const OFFICIAL_MCP_RESERVED_HEADER_NAMES: readonly string[] = [
  ...Object.values(OFFICIAL_MCP_AUTH_HEADER_NAMES).map((name) => name.toLowerCase()),
];

export function isOfficialMcpReservedHeaderName(name: string): boolean {
  return OFFICIAL_MCP_RESERVED_HEADER_NAMES.includes(name.toLowerCase());
}

/** 收集请求中已存在的保留身份头名，供 MCP 装配做覆盖语义校验。 */
export function findOfficialMcpReservedHeaders(
  headers: Record<string, string | undefined> | undefined,
): string[] {
  if (!headers) return [];
  return Object.keys(headers).filter((name) => isOfficialMcpReservedHeaderName(name));
}

// 协议保留可识别的消费方类型；localrun 的鉴权端口仍拒绝官方来源。
export const OFFICIAL_AUTH_CONSUMER_KINDS = ["mcp-server", "plugin-command"] as const;
export type OfficialAuthConsumerKind = (typeof OFFICIAL_AUTH_CONSUMER_KINDS)[number];
