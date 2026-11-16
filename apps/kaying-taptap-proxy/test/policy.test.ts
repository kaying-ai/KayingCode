import { describe, expect, it } from "vitest";

import { isAllowedTapTapPath, isAuthorizedBearer } from "../src/policy.js";

describe("TapTap proxy path allowlist", () => {
  it("allows the three collector endpoints", () => {
    expect(isAllowedTapTapPath("/webapiv2/app-top/v2/hits?type_name=hot")).toBe(true);
    expect(isAllowedTapTapPath("/webapiv2/calendar/v1/event-list?day=1")).toBe(true);
    expect(isAllowedTapTapPath("/webapiv2/top/v3/terms")).toBe(true);
  });

  it("rejects arbitrary hosts, account paths and traversal", () => {
    expect(isAllowedTapTapPath("/")).toBe(false);
    expect(isAllowedTapTapPath("//evil.example/webapiv2/app-top/")).toBe(false);
    expect(isAllowedTapTapPath("https://evil.example/")).toBe(false);
    expect(isAllowedTapTapPath("/webapiv2/account/v1/me")).toBe(false);
    expect(isAllowedTapTapPath("/webapiv2/app-top/../../account")).toBe(false);
    expect(isAllowedTapTapPath("/webapiv2/app-top/%2e%2e/account")).toBe(false);
  });
});

describe("proxy bearer auth", () => {
  it("accepts the exact bearer token", () => {
    expect(isAuthorizedBearer("Bearer secret-token", "secret-token")).toBe(true);
  });

  it("rejects missing, wrong and differently-cased tokens", () => {
    expect(isAuthorizedBearer(null, "secret-token")).toBe(false);
    expect(isAuthorizedBearer("Bearer wrong-token", "secret-token")).toBe(false);
    expect(isAuthorizedBearer("bearer secret-token", "secret-token")).toBe(false);
    expect(isAuthorizedBearer("Bearer secret-token", undefined)).toBe(false);
  });
});
