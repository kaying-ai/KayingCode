import {
  KAYINGCODE_PROVIDER_CONFIG_NETWORK_ERROR,
  KAYINGCODE_PROVIDER_PROJECT_TOKEN_NETWORK_ERROR,
} from "@zcode/shared";
import { ModelErrorCode } from "@zcode/contracts";
import { describe, expect, it } from "vitest";
import { classifyModelFailure } from "../src/model/failure-classifier.js";
import { RuntimeHeadersRefreshError } from "../src/model/runner-runtime-headers.js";

function hostFailure(code: number, message: string): Error {
  return Object.assign(new Error(message), { code });
}

describe("项目 Token 传输故障进入模型重试预算", () => {
  it("网络/超时错误码可重试，并按普通网络错误展示", () => {
    for (const message of ["project_token_network_error", "project_token_timeout"]) {
      const failure = classifyModelFailure(
        new RuntimeHeadersRefreshError(
          hostFailure(KAYINGCODE_PROVIDER_PROJECT_TOKEN_NETWORK_ERROR, message),
        ),
      );
      expect(failure).toMatchObject({
        code: ModelErrorCode.ModelRequestFailed,
        message,
        reason: "network_error",
        retryReason: "network_error",
        retryable: true,
      });
    }
  });

  it("请求校验配置读取失败仍使用专属错误码", () => {
    const failure = classifyModelFailure(
      new RuntimeHeadersRefreshError(
        hostFailure(KAYINGCODE_PROVIDER_CONFIG_NETWORK_ERROR, "request_verification_config_network"),
      ),
    );
    expect(failure).toMatchObject({
      code: ModelErrorCode.ModelRequestVerificationConfigNetwork,
      retryable: true,
    });
  });

  it("旧 headersApplied:false 应答形态即使文案相同也不可重试", () => {
    const failure = classifyModelFailure(
      new RuntimeHeadersRefreshError(hostFailure(-32031, "project_token_network_error")),
    );
    expect(failure.retryable).toBe(false);
  });

  it("其它换证失败码保持不可重试", () => {
    for (const message of [
      "project_token_http_503",
      "project_token_http_401",
      "project_token_invalid_response",
    ]) {
      expect(
        classifyModelFailure(new RuntimeHeadersRefreshError(hostFailure(-32031, message))).retryable,
      ).toBe(false);
    }
  });
});
