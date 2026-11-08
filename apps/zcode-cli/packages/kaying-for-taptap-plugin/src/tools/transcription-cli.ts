/** Workspace-scoped bridge to the bundled three.js transcription CLI. */

import { spawn } from "node:child_process";
import { access, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPluginChildEnvironment } from "../maker/paths";
import type { KayingForTaptapTool } from "./tool-types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MAX_OUTPUT_BYTES = 4 * 1024 * 1024;

const COMMAND_SPECS = {
  init: spec(1, 1, ["dir"], ["name", "dir"]),
  mark: spec(2, 3, [], [], [0], ["force"]),
  note: spec(3, 3, [], [], [0]),
  fetch: spec(1, 1, ["out"], ["out", "max-files"], [], ["insecure", "verbose"]),
  analyze: spec(1, 1, ["out"], ["out"], [0], ["verbose"]),
  ui: spec(1, 1, ["out", "check"], ["out", "check"], [0], ["json", "verbose"]),
  levels: spec(1, 1, ["out"], ["out", "name"], [0], ["raw"]),
  lint: spec(1, 1, [], [], [0], ["json", "all"]),
  rlog: spec(0, 1, ["dir"], ["dir", "lines"], [0], ["json"]),
  compare: spec(2, 2, ["profile", "out"], ["profile", "out"], [0, 1], ["json"]),
  knowledge: spec(0, 0, [], [], [], ["markdown", "landmines"]),
  doctor: spec(0, 0),
} as const;

type TranscriptionCommand = keyof typeof COMMAND_SPECS;

interface CommandSpec {
  minPositionals: number;
  maxPositionals: number;
  pathFlags: ReadonlySet<string>;
  valueFlags: ReadonlySet<string>;
  positionalPaths: ReadonlySet<number>;
  booleanFlags: ReadonlySet<string>;
}

function spec(
  minPositionals: number,
  maxPositionals: number,
  pathFlags: readonly string[] = [],
  valueFlags: readonly string[] = [],
  positionalPaths: readonly number[] = [],
  booleanFlags: readonly string[] = [],
): CommandSpec {
  return {
    minPositionals,
    maxPositionals,
    pathFlags: new Set(pathFlags),
    valueFlags: new Set(valueFlags),
    positionalPaths: new Set(positionalPaths),
    booleanFlags: new Set(booleanFlags),
  };
}

export interface TranscriptionCliInput {
  command: TranscriptionCommand;
  cwd?: string;
  arguments?: string[];
}

export interface TranscriptionCliResult {
  command: TranscriptionCommand;
  cwd: string;
  exitCode: number;
  stdout: string;
  stderr: string;
}

export const transcriptionTool: KayingForTaptapTool = {
  name: "kaying-for-taptap_transcription",
  description:
    "Run the built-in three.js/Canvas to TapTap Maker transcription toolkit. Use it instead of invoking t3m from Bash; the command and every file path are restricted to the current KayingCode workspace.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["command"],
    properties: {
      command: { type: "string", enum: Object.keys(COMMAND_SPECS) },
      cwd: {
        type: "string",
        description: "Workspace-relative working directory. Defaults to the workspace root.",
      },
      arguments: {
        type: "array",
        items: { type: "string" },
        description: "Arguments after the selected t3m subcommand, without the executable name.",
      },
    },
  },
  async execute(input, context) {
    if (!context?.workspacePath) {
      throw new Error("Transcription tools require the Host workspace_path metadata");
    }
    return runTranscriptionCli(
      parseTranscriptionInput(input),
      context.workspacePath,
      context.signal,
    );
  },
};

function parseTranscriptionInput(value: unknown): TranscriptionCliInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Transcription input must be an object");
  }
  const input = value as Record<string, unknown>;
  if (typeof input.command !== "string") throw new Error("Missing transcription command");
  if (input.cwd !== undefined && typeof input.cwd !== "string") {
    throw new Error("Transcription cwd must be a string");
  }
  if (
    input.arguments !== undefined &&
    (!Array.isArray(input.arguments) ||
      input.arguments.some((argument) => typeof argument !== "string"))
  ) {
    throw new Error("Transcription arguments must be an array of strings");
  }
  return {
    command: input.command as TranscriptionCommand,
    ...(input.cwd === undefined ? {} : { cwd: input.cwd as string }),
    ...(input.arguments === undefined ? {} : { arguments: input.arguments as string[] }),
  };
}

export async function runTranscriptionCli(
  input: TranscriptionCliInput,
  workspacePath: string,
  signal?: AbortSignal,
): Promise<TranscriptionCliResult> {
  const invocation = await validateTranscriptionInvocation(input, workspacePath);
  const executable = await resolveTranscriptionCli();
  const output = await spawnAndCollect(
    executable,
    [input.command, ...(input.arguments ?? [])],
    invocation.cwd,
    signal,
  );
  return { command: input.command, cwd: invocation.cwd, ...output };
}

export async function validateTranscriptionInvocation(
  input: TranscriptionCliInput,
  workspacePath: string,
): Promise<{ cwd: string }> {
  const command = input.command as string;
  if (!Object.prototype.hasOwnProperty.call(COMMAND_SPECS, command)) {
    throw new Error(`Unsupported transcription command: ${command}`);
  }
  const args = input.arguments ?? [];
  if (
    !Array.isArray(args) ||
    args.some((value) => typeof value !== "string" || value.includes("\0"))
  ) {
    throw new Error("Transcription arguments must be strings without NUL bytes");
  }

  const workspace = await realpath(path.resolve(workspacePath));
  const cwd = path.resolve(workspace, input.cwd ?? ".");
  await assertWorkspacePath(workspace, cwd, "cwd");
  const cwdRealPath = await realpath(cwd);
  assertPathInside(workspace, cwdRealPath, "cwd resolves outside the current workspace");

  await validateArguments(COMMAND_SPECS[input.command], args, workspace, cwdRealPath);
  return { cwd: cwdRealPath };
}

async function validateArguments(
  command: CommandSpec,
  args: string[],
  workspace: string,
  cwd: string,
): Promise<void> {
  const positionals: string[] = [];
  const pathValues: Array<{ label: string; value: string }> = [];
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index]!;
    if (token === "-v") {
      if (!command.booleanFlags.has("verbose")) throw new Error("Unexpected flag: -v");
      continue;
    }
    if (!token.startsWith("--")) {
      positionals.push(token);
      continue;
    }

    const [rawName, inlineValue] = token.slice(2).split(/=(.*)/su, 2);
    if (command.booleanFlags.has(rawName!)) {
      if (inlineValue !== undefined) throw new Error(`Flag --${rawName} does not take a value`);
      continue;
    }
    if (!command.valueFlags.has(rawName!)) throw new Error(`Unexpected flag: --${rawName}`);
    const value = inlineValue ?? args[++index];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`Flag --${rawName} requires a value`);
    }
    if (command.pathFlags.has(rawName!)) pathValues.push({ label: `--${rawName}`, value });
  }

  if (positionals.length < command.minPositionals || positionals.length > command.maxPositionals) {
    throw new Error(
      `Expected ${command.minPositionals}..${command.maxPositionals} positional arguments, got ${positionals.length}`,
    );
  }
  for (const index of command.positionalPaths) {
    const value = positionals[index];
    if (value !== undefined) pathValues.push({ label: `argument ${index + 1}`, value });
  }
  for (const pathValue of pathValues) {
    await assertWorkspacePath(workspace, path.resolve(cwd, pathValue.value), pathValue.label);
  }
}

async function assertWorkspacePath(root: string, target: string, label: string): Promise<void> {
  assertPathInside(root, target, `${label} must stay inside the current workspace`);
  const ancestor = await resolveExistingAncestor(target);
  assertPathInside(root, ancestor, `${label} resolves outside the current workspace`);
}

async function resolveExistingAncestor(filePath: string): Promise<string> {
  let candidate = filePath;
  while (true) {
    try {
      return await realpath(candidate);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      const parent = path.dirname(candidate);
      if (parent === candidate) throw error;
      candidate = parent;
    }
  }
}

function assertPathInside(root: string, target: string, message: string): void {
  const relativePath = path.relative(root, target);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) throw new Error(message);
}

async function resolveTranscriptionCli(): Promise<string> {
  const binaryName = process.platform === "win32" ? "t3m.exe" : "t3m";
  const pluginRoot = process.env.KAYINGCODE_PLUGIN_ROOT ?? path.resolve(__dirname, "..", "..");
  const platformArch = `${process.platform}-${process.arch}`;
  // 修复依据：转写入口必须绑定插件随包二进制，不能接受环境变量覆盖到任意可执行文件。
  const candidates = [
    path.join(pluginRoot, "bin", platformArch, binaryName),
    path.join(pluginRoot, "native", "threejs-to-taptapmaker", "target", "release", binaryName),
    path.join(pluginRoot, "native", "threejs-to-taptapmaker", "target", "debug", binaryName),
  ];
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next package-local candidate.
    }
  }
  throw new Error(
    `Built-in transcription binary not found for ${platformArch}. Rebuild the official kaying-for-taptap plugin native artifacts.`,
  );
}

function spawnAndCollect(
  executable: string,
  args: string[],
  cwd: string,
  signal?: AbortSignal,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd,
      env: createPluginChildEnvironment(),
      signal,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let outputBytes = 0;
    const append = (kind: "stdout" | "stderr", chunk: Buffer | string) => {
      outputBytes += Buffer.byteLength(chunk);
      if (outputBytes > MAX_OUTPUT_BYTES) {
        child.kill();
        reject(new Error("Transcription command output exceeded the 4 MiB limit"));
        return;
      }
      if (kind === "stdout") stdout += chunk.toString();
      else stderr += chunk.toString();
    };
    child.stdout.on("data", (chunk) => append("stdout", chunk));
    child.stderr.on("data", (chunk) => append("stderr", chunk));
    child.once("error", reject);
    child.once("close", (code, closeSignal) => {
      if (code === null) {
        reject(new Error(`Transcription command terminated by ${closeSignal ?? "unknown signal"}`));
        return;
      }
      resolve({ exitCode: code, stdout, stderr });
    });
  });
}
