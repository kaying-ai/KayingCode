import { access, chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { Logger } from "@zcode/contracts";
import {
  AGENT_CLI_SHIM_COMMAND,
  buildAgentCliPosixShim,
  buildAgentCliWindowsShim,
  resolveAgentCliShimDir,
  type AgentCliShimInvocation,
} from "@zcode/shared/agent-cli-shim";

/**
 * 为 Agent 的 Bash 会话生成稳定的 `kayingcode` 入口。
 * 桌面打包态只把 CLI bundle 放在应用资源里，不写系统 PATH；这里把同一入口
 * 落到数据目录并由 Bash 工具前置到 PATH（见 spec/agent-cli-shim.md）。
 */

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * 解析 shim 应指向的 CLI 入口。
 * - 源码入口（.ts）：优先同包 dist/kayingcode.cjs，缺少生成物时不猜；
 * - bundle/脚本入口：execPath + 脚本；Electron 打包态以纯 Node 模式启动；
 * - 独立二进制（SEA）：直接执行 execPath；argv[1] 是用户子命令而不是脚本。
 */
export async function resolveAgentCliShimInvocation(
  options: {
    execPath?: string;
    /** `undefined` 取 process.argv[1]；`null` 表示独立二进制（没有脚本参数）。 */
    scriptPath?: string | null;
    electron?: boolean;
    /** 单文件二进制；默认读取 node:sea 运行时。 */
    sea?: boolean;
    exists?: (path: string) => Promise<boolean>;
  } = {},
): Promise<AgentCliShimInvocation | null> {
  const execPath = options.execPath ?? process.execPath;
  const scriptPath =
    options.scriptPath === undefined ? process.argv[1] : (options.scriptPath ?? undefined);
  const electron = options.electron ?? Boolean(process.versions.electron);
  const exists = options.exists ?? pathExists;
  const electronRunAsNode = electron ? true : undefined;

  if (options.sea ?? isSeaRuntime()) {
    return { command: execPath, electronRunAsNode };
  }
  if (scriptPath && scriptPath.endsWith(".ts")) {
    const builtEntry = resolve(dirname(scriptPath), "..", "dist", "kayingcode.cjs");
    if (!(await exists(builtEntry))) return null;
    return { command: execPath, entry: builtEntry, electronRunAsNode };
  }
  if (scriptPath && (await exists(scriptPath))) {
    return { command: execPath, entry: scriptPath, electronRunAsNode };
  }
  if (!scriptPath) {
    return { command: execPath, electronRunAsNode };
  }
  // 未知脚本参数不生成 shim，避免制造错误入口。
  return null;
}

function isSeaRuntime(): boolean {
  const getBuiltinModule = process.getBuiltinModule as
    | ((id: "node:sea") => { isSea?: () => boolean })
    | undefined;
  try {
    return getBuiltinModule?.("node:sea")?.isSea?.() === true;
  } catch {
    return false;
  }
}

async function writeIfChanged(path: string, content: string, mode: number): Promise<boolean> {
  const existing = await readFile(path, "utf8").catch((error) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (existing === content) return false;
  await writeFile(path, content, { mode });
  await chmod(path, mode).catch(() => undefined);
  return true;
}

export async function ensureAgentCliShim(
  options: {
    env?: NodeJS.ProcessEnv;
    logger?: Pick<Logger, "debug">;
    invocation?: AgentCliShimInvocation | null;
    platform?: NodeJS.Platform;
  } = {},
): Promise<void> {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  try {
    const invocation =
      options.invocation === undefined ? await resolveAgentCliShimInvocation() : options.invocation;
    if (!invocation) return;
    const directory = resolveAgentCliShimDir(env);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await chmod(directory, 0o700).catch(() => undefined);
    const written: string[] = [];
    if (
      await writeIfChanged(
        join(directory, AGENT_CLI_SHIM_COMMAND),
        buildAgentCliPosixShim(invocation),
        0o755,
      )
    ) {
      written.push(AGENT_CLI_SHIM_COMMAND);
    }
    if (platform === "win32") {
      if (
        await writeIfChanged(
          join(directory, `${AGENT_CLI_SHIM_COMMAND}.cmd`),
          buildAgentCliWindowsShim(invocation),
          0o644,
        )
      ) {
        written.push(`${AGENT_CLI_SHIM_COMMAND}.cmd`);
      }
    }
    if (written.length > 0) {
      options.logger?.debug("[agent-cli-shim] 已更新 Agent CLI 入口", {
        directory,
        files: written.join(","),
      });
    }
  } catch (error) {
    // shim 只影响 Agent 能否直接执行 kayingcode；失败不能让 CLI 启动失败。
    options.logger?.debug("[agent-cli-shim] 生成失败，已跳过", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
