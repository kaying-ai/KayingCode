/**
 * Agent 子进程的预装工具 env 组装。唯一判定点：bin 目录存在且至少有一个公开入口。
 *
 * 产品没有默认资源 CDN，未准备任何工具时不能注入 AVAILABLE 或空 PATH 项：文档插件看到
 * AVAILABLE 会永久停在“预装未就绪”引导上，而该引导在本产品里无法通过准备完成。
 * PATH 只在注入时前置，其他情况完全沿用父进程语义（packages/shared/spec/preinstalled-tools.md）。
 */
import { readdirSync } from "node:fs";
import { KAYINGCODE_PREINSTALLED_TOOLS_AVAILABLE_ENV } from "@zcode/shared/preinstalled-tools";
import { prependPathEntries } from "./runtimeToolResolver.js";

export interface PreinstalledToolsAgentEnvInput {
  /** Host 计算出的固定入口目录；远端/Web/独立 CLI 不传。 */
  binDir?: string;
  /** 组装基础 PATH；缺省为空，由调用方显式传入 process.env.PATH。 */
  basePath?: string;
}

/**
 * bin 目录里是否存在至少一个公开入口。
 * 入口名由契约限定为字母数字开头，Windows 撤下中的 `.retired/` 及任何隐藏文件都不算入口。
 */
function hasPreinstalledToolEntries(binDir: string): boolean {
  const trimmed = binDir.trim();
  if (!trimmed) return false;
  try {
    return readdirSync(trimmed).some((entry) => !entry.startsWith("."));
  } catch {
    // 目录不存在、无权限或不是目录都按“没有工具”处理：不能让探测失败变成 PATH 语义变化。
    return false;
  }
}

/**
 * 返回需要合并进 Agent spawn env 的键。
 * 无工具时返回空对象，调用方不需要再判断 AVAILABLE / PATH。
 */
export function resolvePreinstalledToolsAgentEnv(
  input: PreinstalledToolsAgentEnvInput,
): Record<string, string> {
  const binDir = input.binDir?.trim();
  if (!binDir || !hasPreinstalledToolEntries(binDir)) return {};
  return {
    [KAYINGCODE_PREINSTALLED_TOOLS_AVAILABLE_ENV]: "1",
    PATH: prependPathEntries(input.basePath ?? "", [binDir]),
  };
}
