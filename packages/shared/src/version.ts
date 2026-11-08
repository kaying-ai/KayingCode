// 由各 bundler 通过 define 注入，避免运行时 JSON import 的跨 bundler 兼容问题。
// 非构建环境（如 e2e 测试的 mocha）下 define 不存在，
// 用 typeof 检查 + fallback 避免 ReferenceError。
declare const __KAYINGCODE_VERSION__: string;
declare const __KAYINGCODE_COMMIT__: string;
declare const __KAYINGCODE_BUILD_TIME__: string;
declare const __ZCODE_UPSTREAM_VERSION__: string;

export const KAYINGCODE_VERSION: string =
  typeof __KAYINGCODE_VERSION__ !== "undefined" ? __KAYINGCODE_VERSION__ : "0.0.0-dev";
export const KAYINGCODE_COMMIT: string =
  typeof __KAYINGCODE_COMMIT__ !== "undefined" ? __KAYINGCODE_COMMIT__ : "unknown";
export const KAYINGCODE_BUILD_TIME: string =
  typeof __KAYINGCODE_BUILD_TIME__ !== "undefined" ? __KAYINGCODE_BUILD_TIME__ : "unknown";
/** 已验收的官方 ZCode 上游基线版本（来自 UPSTREAM_BASE.json），与产品版本分开展示。 */
export const ZCODE_UPSTREAM_VERSION: string =
  typeof __ZCODE_UPSTREAM_VERSION__ !== "undefined" ? __ZCODE_UPSTREAM_VERSION__ : "unknown";
export const ZCODE_VERSION = KAYINGCODE_VERSION;
