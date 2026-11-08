/**
 * KayingCode.localrun：无官方 Server MCP 鉴权。
 * fetch 包装恒为透传，不解析/注入身份头。
 */
import type { McpServerFailureKind, OfficialMcpAuthFailureKind } from "@zcode/shared";

export type { OfficialMcpAuthFailureKind };

export interface OfficialMcpServerResponseInfo {
  spanId?: string;
  serverRequestId?: string;
  rpcMethod?: string;
  failureKind?: McpServerFailureKind;
  status?: number;
  headers?: Record<string, string | undefined>;
  bodyText?: string;
}

export class OfficialMcpAuthError extends Error {
  readonly kind: OfficialMcpAuthFailureKind;
  constructor(kind: OfficialMcpAuthFailureKind, message: string) {
    super(message);
    this.name = "OfficialMcpAuthError";
    this.kind = kind;
  }
}

export interface CreateOfficialMcpAuthFetchInput {
  url: string;
  baseFetch?: typeof globalThis.fetch;
  onServerResponse?: (response: OfficialMcpServerResponseInfo) => void;
  serverName?: string;
  official?: { mcpKey: string; pluginId: string };
  trustedOrigins?: {
    isTrusted(input: {
      mcpKey: string;
      origin: string;
      pluginId: string;
    }): Promise<{ trusted: boolean; detail?: string }>;
  };
  authHeaders?: unknown;
  onAuthFailure?: (kind: OfficialMcpAuthFailureKind) => void;
  [key: string]: unknown;
}

export function createOfficialMcpAuthFetch(
  input: CreateOfficialMcpAuthFetchInput,
): typeof globalThis.fetch {
  // KayingCode.localrun：无官方 Server MCP 鉴权；请求原样透传。
  void input;
  return async (resource, init) => {
    return await globalThis.fetch(resource as RequestInfo | URL, init);
  };
}
