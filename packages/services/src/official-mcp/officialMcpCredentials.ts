/**
 * KayingCode.localrun：无账号 / 无官方 Server MCP Coding Plan 凭证。
 * 保留入口形状，解析恒失败；不构造 MaaS JWT / Bigmodel 身份头。
 */
import type { ModelSelectionView } from "@zcode/provider";

export type OfficialMcpPlanScope =
  | { targetType: "PERSONAL" }
  | { targetType: "TEAM"; organizationId: string; projectId: string };

export type OfficialMcpWireScope = OfficialMcpPlanScope | null;

export interface OfficialMcpCredentialSnapshot {
  jwt: string;
  codingPlanAuthorization?: string;
  providerFamily: "zai" | "bigmodel";
  planScope: OfficialMcpPlanScope | null;
  wireScope: OfficialMcpWireScope;
}

export type OfficialMcpAuthFailureReason =
  | "not_authenticated"
  | "not_configured"
  | "no_plan"
  | "unavailable";

export type OfficialMcpCredentialOutcome =
  | { ok: true; snapshot: OfficialMcpCredentialSnapshot }
  | { ok: false; reason: OfficialMcpAuthFailureReason };

export interface OfficialMcpCredentialResolverDeps {
  accountRequestAuthService?: unknown;
  credentialService?: unknown;
  modelSelectionService?: {
    getView(): Promise<ModelSelectionView>;
  };
}

/** KayingCode.localrun：无官方 MCP 账号凭证。 */
export async function resolveOfficialMcpCredentials(
  _deps: OfficialMcpCredentialResolverDeps,
): Promise<OfficialMcpCredentialOutcome> {
  return { ok: false, reason: "not_authenticated" };
}

/** KayingCode.localrun：不构造官方 MCP 身份头。 */
export function buildOfficialMcpAuthHeaders(_snapshot: OfficialMcpCredentialSnapshot): Record<string, string> {
  return {};
}

export function createOfficialMcpAuthHeadersResolver(_deps: OfficialMcpCredentialResolverDeps): {
  resolveHeaders(request: {
    mcpKey: string;
    pluginId: string;
    targetOrigin: string;
    workspace: { workspaceIdentity?: string; workspaceKey: string; workspacePath: string };
  }): Promise<
    | { ok: true; headers: Record<string, string> }
    | { ok: false; reason: "official_auth_unavailable" | "official_auth_plan_required" }
  >;
} {
  return {
    resolveHeaders: async () => ({ ok: false as const, reason: "official_auth_unavailable" as const }),
  };
}
