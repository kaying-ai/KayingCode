import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { KayingForTaptapOperationLogger } from "../operations/logging";
import {
  createPluginChildEnvironment,
  getKayingForTaptapPackageRoot,
  getMakerHome,
  getNodeCommand,
  getVendorDistPath,
  type MakerEnvironment,
} from "./paths";

export interface MakerCommandResult {
  ok: boolean;
  command: string[];
  cwd: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  error?: string;
}

export interface MakerLaunch {
  command: string;
  args: string[];
  env: Record<string, string>;
}

export type MakerBundleName = "maker" | "server" | "proxy";

const BUNDLE_FILES: Record<MakerBundleName, "maker.js" | "server.js" | "proxy.js"> = {
  maker: "maker.js",
  server: "server.js",
  proxy: "proxy.js",
};

export function resolveMakerBundle(name: MakerBundleName): string {
  return getVendorDistPath(BUNDLE_FILES[name]);
}

/** Marker used when the parent process left an internal R&D Maker environment. */
const DEFAULT_MAKER_ENVIRONMENT: MakerEnvironment = "production";

export function createMakerEnvironment(extra?: NodeJS.ProcessEnv): Record<string, string> {
  const makerHome = extra?.TAPTAP_MAKER_HOME || getMakerHome();
  const env = createPluginChildEnvironment({
    ...extra,
    KAYING_FOR_TAPTAP_PACKAGE_ROOT: getKayingForTaptapPackageRoot(),
    TAPTAP_MAKER_HOME: makerHome,
  });
  // 修复依据：宿主进程可能残留 TAPTAP_MCP_ENV=rnd（内网 R&D，Git 远端为
  // fuping.agnt.xd.com，公网 TLS 不可用）。正常转换/发布链路必须落到 production，
  // 否则新建工程会绑上不可用的内部 Git 地址。仅当 extra 显式指定时才允许 rnd。
  const explicit = extra?.TAPTAP_MCP_ENV;
  if (explicit !== "rnd" && explicit !== "production") {
    env.TAPTAP_MCP_ENV = DEFAULT_MAKER_ENVIRONMENT;
  }
  // When running inside Electron, process.execPath is the Electron binary rather than Node.
  // Force it into Node mode so bundled JS files execute as CLI scripts instead of Electron apps.
  if (process.versions.electron) {
    env.ELECTRON_RUN_AS_NODE = "1";
  }
  return env;
}

/** Build the child environment while selecting Maker's remote endpoint. */
export function createMakerEnvironmentForTarget(
  target?: MakerEnvironment,
  extra?: NodeJS.ProcessEnv,
): Record<string, string> {
  return createMakerEnvironment({
    ...extra,
    ...(target ? { TAPTAP_MCP_ENV: target } : {}),
  });
}

export function createMakerMcpLaunch(): MakerLaunch {
  return {
    command: getNodeCommand(),
    args: [resolveMakerBundle("maker")],
    env: createMakerEnvironment(),
  };
}

export async function importMakerBundle(name: MakerBundleName): Promise<void> {
  await import(pathToFileURL(resolveMakerBundle(name)).href);
}

export async function runMakerCommand(input: {
  args: string[];
  cwd?: string;
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
  logger?: KayingForTaptapOperationLogger;
  preserveStdout?: boolean;
  signal?: AbortSignal;
}): Promise<MakerCommandResult> {
  const bundlePath = resolveMakerBundle("maker");
  const cwd = path.resolve(input.cwd ?? process.cwd());
  return await runNodeBundle({
    bundlePath,
    args: input.args,
    cwd,
    timeoutMs: input.timeoutMs ?? 120_000,
    env: input.env,
    logger: input.logger,
    preserveStdout: input.preserveStdout,
    signal: input.signal,
  });
}

export async function runNodeBundle(input: {
  bundlePath: string;
  args: string[];
  cwd: string;
  timeoutMs: number;
  env?: NodeJS.ProcessEnv;
  logger?: KayingForTaptapOperationLogger;
  preserveStdout?: boolean;
  signal?: AbortSignal;
}): Promise<MakerCommandResult> {
  try {
    await access(input.bundlePath);
  } catch {
    const result = {
      ok: false,
      command: [getNodeCommand(), input.bundlePath, ...input.args],
      cwd: input.cwd,
      exitCode: null,
      stdout: "",
      stderr: "",
      error: `Bundled Maker runtime is missing: ${input.bundlePath}`,
    };
    input.logger?.warn("runtime", "Bundled Maker runtime is missing", result);
    return result;
  }
  return new Promise((resolve) => {
    const command = [getNodeCommand(), input.bundlePath, ...input.args];
    input.logger?.info("command_before", "Starting bundled Maker command", {
      command,
      cwd: input.cwd,
      timeoutMs: input.timeoutMs,
    });
    const child = spawn(command[0], command.slice(1), {
      cwd: input.cwd,
      env: createMakerEnvironment(input.env),
      signal: input.signal,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      input.logger?.warn("command_timeout", "Bundled Maker command exceeded its timeout", {
        command,
        timeoutMs: input.timeoutMs,
      });
      child.kill("SIGTERM");
    }, input.timeoutMs);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const result = {
        ok: false,
        command,
        cwd: input.cwd,
        exitCode: null,
        stdout,
        stderr,
        error: error.message,
      };
      input.logger?.error("command_after", "Bundled Maker command failed to start", result);
      resolve(result);
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const result = {
        ok: !timedOut && code === 0,
        command,
        cwd: input.cwd,
        exitCode: code,
        stdout: input.preserveStdout ? stdout.trim() : summarize(stdout),
        stderr: summarize(stderr),
        ...(timedOut ? { error: `Maker command timed out after ${input.timeoutMs}ms` } : {}),
      };
      const logResult = input.preserveStdout
        ? { ...result, stdout: `<${stdout.trim().length} characters omitted from operation log>` }
        : result;
      if (result.ok) {
        input.logger?.info("command_after", "Bundled Maker command exited", logResult);
      } else {
        input.logger?.error("command_after", "Bundled Maker command failed", logResult);
      }
      resolve(result);
    });
  });
}

function summarize(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= 8000) return trimmed;
  return `${trimmed.slice(0, 4000)}\n...\n${trimmed.slice(-4000)}`;
}
