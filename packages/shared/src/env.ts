import type { KayingCodeRuntimeEnv } from "./runtimeEnv.js";

export type KayingCodeEnv = "test" | "production";
/** 安装包身份：决定应用名、app id、Electron 数据目录与更新策略；与后端环境 `KayingCodeEnv` 是两个轴。 */
export type KayingCodeProductFlavor = "production" | "preview";
export type ArmsRumEnv = "local" | "prod";

// 非构建环境（如 e2e 测试的 mocha）下 define 不存在，用 typeof 检查 + fallback 避免 ReferenceError
declare const __KAYINGCODE_ENV__: string;
declare const __KAYINGCODE_PRODUCT_FLAVOR__: string;

export function normalizeKayingCodeEnv(value: string | undefined): KayingCodeEnv {
  return value?.trim().toLowerCase() === "production" ? "production" : "test";
}

export const KAYINGCODE_ENV = normalizeKayingCodeEnv(
  typeof __KAYINGCODE_ENV__ !== "undefined" ? __KAYINGCODE_ENV__ : undefined,
);

/**
 * 身份缺省跟随后端环境（test → preview，production → production）。
 * 桌面构建通过 `KAYINGCODE_PREVIEW_IDENTITY=1` 显式注入 preview，得到连接生产后端的 Preview 包；
 * 未注入 define 的 bundle（web、CLI、测试）沿用旧的单轴语义。
 */
export function normalizeKayingCodeProductFlavor(
  value: string | undefined,
  kayingcodeEnv: KayingCodeEnv,
): KayingCodeProductFlavor {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "production" || normalized === "preview") {
    return normalized;
  }
  return kayingcodeEnv === "production" ? "production" : "preview";
}

export const KAYINGCODE_PRODUCT_FLAVOR = normalizeKayingCodeProductFlavor(
  typeof __KAYINGCODE_PRODUCT_FLAVOR__ !== "undefined" ? __KAYINGCODE_PRODUCT_FLAVOR__ : undefined,
  KAYINGCODE_ENV,
);
export const KAYINGCODE_APP_VERSION_ENV = "KAYINGCODE_APP_VERSION" as const;
export const KAYINGCODE_BUILD_COMMIT_ID_ENV = "KAYINGCODE_BUILD_COMMIT_ID" as const;

// ── 运行时环境变量（不经过编译打包，启动时从 process.env 读取） ──
// 启用调试模式，值为 inspect-brk 的端口号，如 KAYINGCODE_DEBUG=9230
export const RUNTIME_KAYINGCODE_DEBUG =
  typeof process !== "undefined" ? process.env.KAYINGCODE_DEBUG : undefined;

// 恢复原因：写死 false 会让运行时已配置的数仓/ARMS 永远空转。
// 功能保持可用；实际出网由各出口的运行时端点检查决定，未配置不上报。
export const KAYINGCODE_TELEMETRY_ENABLED: boolean = false;

/** 数仓事件上报端点：由运行时环境变量提供，未配置即停用，构建产物不内嵌。 */
export const KAYINGCODE_TELEMETRY_REPORT_ENDPOINT =
  typeof process !== "undefined" ? (process.env.KAYINGCODE_TELEMETRY_REPORT_ENDPOINT ?? "") : "";
// KayingCode.localrun：无官方遥测端点，空字符串表示不上报。

/** ARMS RUM 接入端点：由运行时环境变量提供，未配置即停用，构建产物不内嵌。 */
export const KAYINGCODE_ARMS_RUM_ENDPOINT =
  typeof process !== "undefined" ? (process.env.KAYINGCODE_ARMS_RUM_ENDPOINT ?? "") : "";

// Upstream compatibility: upstream imports these build-time constants; KayingCode keeps
// runtime-driven endpoints and disables telemetry/auto-update by default.
export const ZCODE_TELEMETRY_REPORT_ENDPOINT = KAYINGCODE_TELEMETRY_REPORT_ENDPOINT;
export const ZCODE_ARMS_RUM_ENDPOINT = KAYINGCODE_ARMS_RUM_ENDPOINT;
export const ZCODE_AUTO_UPDATE_ENABLED = false;

/** 将本地运行态与编译期 KAYINGCODE_ENV 映射为 ARMS 控制台识别的上报环境标签 */
export function mapKayingCodeEnvToArmsRumEnv(runtimeEnv: KayingCodeRuntimeEnv): ArmsRumEnv {
  return runtimeEnv !== "development" && KAYINGCODE_ENV === "production" ? "prod" : "local";
}
