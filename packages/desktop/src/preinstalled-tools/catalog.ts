import { readFile } from "node:fs/promises";
import {
  resolvePreinstalledToolsCatalog,
  type PreinstalledToolConfiguration,
} from "@zcode/shared/preinstalled-tools";
import preinstalledToolCatalog from "@desktop/preinstalled-tools/catalog.json" with { type: "json" };

declare const __KAYINGCODE_PREINSTALL_TEST_BUILD__: boolean;
// 单元测试/未经过 tsup define 的环境没有该常量；typeof 守卫与 shared/env.ts 的构建期常量一致。
const preinstalledTestBuild =
  typeof __KAYINGCODE_PREINSTALL_TEST_BUILD__ !== "undefined" &&
  __KAYINGCODE_PREINSTALL_TEST_BUILD__;

const PREINSTALLED_TOOLS_CDN_BASE_URL_ENV = "KAYINGCODE_PREINSTALLED_TOOLS_CDN_BASE_URL";

/**
 * 设置了覆盖变量就按书写顺序使用候选。
 * 本产品尚未发布自己的预装工具资源，也没有官方预装工具 CDN：未配置覆盖变量时返回空列表，
 * 装配结果保留全部工具描述但 target 为 null，因此不会自动下载任何资源。
 * 产品发布资源后在这里补默认基址（或继续由发布流程注入覆盖变量）。
 */
function resolvePreinstalledToolsCdnBaseUrls(): string[] {
  const override = process.env[PREINSTALLED_TOOLS_CDN_BASE_URL_ENV]
    ?.split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return override ?? [];
}

/**
 * Main 只装配构建配置；Host 无需等待本次读取或工具初始化。
 * 返回 null 表示清单不可用：工具归属未知，预装进程不得按 catalog 回收任何入口或目录。
 * 修复原因：此前任何装配失败都在 Main 变成空列表，预装进程把它当作全部工具移出 catalog，
 * 撤销入口并删除已安装资源（含 Python 附加区）。
 */
export async function loadPreinstalledToolsCatalog(logger: {
  error(...args: unknown[]): void;
}): Promise<PreinstalledToolConfiguration[] | null> {
  try {
    const catalog: unknown =
      preinstalledTestBuild && process.env.KAYINGCODE_E2E_PREINSTALLED_TOOLS_CATALOG
        ? JSON.parse(await readFile(process.env.KAYINGCODE_E2E_PREINSTALLED_TOOLS_CATALOG, "utf8"))
        : preinstalledToolCatalog;
    const baseUrls = resolvePreinstalledToolsCdnBaseUrls();
    const { tools, downloadBaseUrlsError } = resolvePreinstalledToolsCatalog(
      catalog,
      process.platform,
      process.arch,
      baseUrls,
    );
    // 未配置基址是当前产品预期状态（没有官方资源），不作为错误记录；只有显式配置非法才告警。
    if (downloadBaseUrlsError && baseUrls.length)
      logger.error(
        `[preinstalled-tools] invalid ${PREINSTALLED_TOOLS_CDN_BASE_URL_ENV}; all tools have no target`,
        downloadBaseUrlsError,
      );
    return tools;
  } catch (error) {
    logger.error("[preinstalled-tools] invalid static target configuration", error);
    return null;
  }
}
