import { describe, expect, it, vi } from "vitest";
import { API_KEY_USAGE_SCENE } from "../src/api-key-usage-scene.js";
import {
  isProjectTokenTransportFailureCode,
  ProjectAccessTokenCache,
  ProjectAccessTokenTransientError,
  type ProjectAccessTokenScope,
} from "../src/project-access-token.js";

const scope: ProjectAccessTokenScope = {
  origin: "https://example.test",
  family: "bigmodel",
  accountId: "account",
  organizationId: "organization",
  projectId: "project",
  apiKeyId: "key",
  usageScene: API_KEY_USAGE_SCENE.CODING_PLAN,
  loginGeneration: "generation",
};

function tokenResponse(token: string, now: number): unknown {
  return {
    code: "0",
    data: {
      accessToken: token,
      tokenType: "Bearer",
      expiresIn: 600,
      expiresAt: Math.floor(now / 1_000) + 600,
    },
  };
}

describe("isProjectTokenTransportFailureCode", () => {
  it("只认网络与超时两个传输故障码", () => {
    expect(isProjectTokenTransportFailureCode("project_token_network_error")).toBe(true);
    expect(isProjectTokenTransportFailureCode("project_token_timeout")).toBe(true);
    for (const code of [
      "project_token_http_429",
      "project_token_http_503",
      "project_token_invalid_response",
      "project_token_request_failed",
    ]) {
      expect(isProjectTokenTransportFailureCode(code)).toBe(false);
    }
  });
});

describe("ProjectAccessTokenCache 换证降级探测", () => {
  it("hasValidFallback 按当前缓存有效期实时判断，不冻结在请求开始", async () => {
    let now = 1_000_000;
    const cache = new ProjectAccessTokenCache({ now: () => now, random: () => 0 });
    const fallbackAtIssue: boolean[] = [];
    const issue = vi.fn(async (hasValidFallback: () => boolean) => {
      fallbackAtIssue.push(hasValidFallback());
      if (fallbackAtIssue.length === 1) return tokenResponse("old-pat", now);
      throw new ProjectAccessTokenTransientError({ kind: "network" });
    });

    await expect(cache.resolve(scope, issue)).resolves.toMatchObject({ token: "old-pat" });

    // 进入提前刷新窗口后签发失败：仍有效的旧 PAT 让本次换证直接降级，不再等待重试。
    now += 481_000;
    await expect(cache.resolve(scope, issue)).resolves.toMatchObject({ token: "old-pat" });
    expect(fallbackAtIssue).toEqual([false, true]);

    // 旧 PAT 过期后没有再可降级的值，换证失败必须上抛。
    now += 125_000;
    await expect(cache.resolve(scope, issue)).rejects.toBeInstanceOf(
      ProjectAccessTokenTransientError,
    );
    expect(fallbackAtIssue).toEqual([false, true, false]);
  });
});
