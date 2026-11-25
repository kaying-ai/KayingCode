import { describe, expect, it } from "vitest";
import { parseEntryExtensionSummary, parseEntryStoreListing } from "../src/plugins/marketplace.js";

// 扩展摘要（packages/shared/spec/plugin-extension-summary.md）：CLI 只透传，只留 engines.zcode 与字符串
// grants，不检查范围格式；它不进 Store Listing，由 overview 按请求参数决定带不带。
describe("marketplace catalog extension summary", () => {
  it("parses the catalog extension summary and keeps only the two known keys", () => {
    expect(
      parseEntryExtensionSummary({
        extensionSummary: {
          engines: { zcode: "^1.4.0", node: ">=20" },
          grants: ["sessions.fullAccess", 42, "notifications"],
          main: "./dist/extension.js",
        },
      }),
    ).toEqual({ engines: { zcode: "^1.4.0" }, grants: ["sessions.fullAccess", "notifications"] });
    // 范围格式不检查：App 不认识的写法由 App 判不兼容。
    expect(
      parseEntryExtensionSummary({ extensionSummary: { engines: { zcode: ">=1.4.0 <3" } } }),
    ).toEqual({ engines: { zcode: ">=1.4.0 <3" }, grants: [] });
    expect(parseEntryExtensionSummary({})).toBeUndefined();
    expect(parseEntryExtensionSummary({ extensionSummary: "^1.4.0" })).toBeUndefined();
    expect(parseEntryExtensionSummary({ extensionSummary: { grants: [] } })).toBeUndefined();
    expect(
      parseEntryExtensionSummary({ extensionSummary: { engines: { zcode: "  " } } }),
    ).toBeUndefined();
    expect(
      parseEntryExtensionSummary({ extensionSummary: { engines: { zcode: 1 } } }),
    ).toBeUndefined();
    // 摘要不是 Store Listing 字段：parseEntryStoreListing 不读它，只读摘要的条目不会伪造空 listing。
    expect(
      parseEntryStoreListing({
        extensionSummary: { engines: { zcode: "^1.4.0" }, grants: [] },
      }),
    ).toBeUndefined();
  });
});
