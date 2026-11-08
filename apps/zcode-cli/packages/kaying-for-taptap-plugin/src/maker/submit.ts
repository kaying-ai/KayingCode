import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { pathExists } from "../async-files";
import {
  createKayingForTaptapOperationLogger,
  type KayingForTaptapOperationLogger,
  type KayingForTaptapOperationLogSummary,
} from "../operations/logging";
import { ensureMakerBuildScaffold } from "./build-scaffold";
import { assertProductionMakerGitRemote } from "./git-remote-guard";
import { formatMakerLuaPreflightFailure, runMakerLuaPreflight } from "./lua-preflight";
import { assessLuaPublishDiagnostics } from "./lua-publish-policy";
import { callMakerMcpTool, type MakerMcpProgress } from "./mcp-client";
import { restoreClobberedMakerMetadata } from "./metadata-guard";
import { getMakerHome } from "./paths";
import { resolveMakerBuildLocation } from "./submit-target";

export type { MakerBuildLocation } from "./submit-target";
export { resolveMakerBuildLocation } from "./submit-target";

export interface SubmitToTapTapInput {
  projectRoot: string;
  entry?: string;
  scriptsPath?: string;
  message?: string;
  files?: string[];
  env?: "rnd" | "production";
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface SubmitToTapTapResult {
  ok: boolean;
  projectRoot: string;
  previewUrl: string | null;
  tool: "maker_build_current_directory";
  command: string[];
  text: string;
  isError: boolean;
  progress: MakerMcpProgress[];
  stderr: string;
  error?: string;
  warnings?: string[];
  operationLog: KayingForTaptapOperationLogSummary;
}

interface MakerToolResult {
  isError?: boolean;
  content?: Array<{ type?: string; text?: string } | Record<string, unknown>>;
}

export type { MakerMcpProgress } from "./mcp-client";

export interface SubmitToTapTapCallbacks {
  onProgress?: (progress: MakerMcpProgress) => void;
}

const SUBMIT_TOOL_NAME = "maker_build_current_directory";
const STATUS_TOOL_NAME = "maker_status_lite";
const DEFAULT_SUBMIT_TIMEOUT_MS = 15 * 60_000;
const DEFAULT_AUTH_REFRESH_TIMEOUT_MS = 60_000;
const execFileAsync = promisify(execFile);

export async function submitToTapTap(
  input: SubmitToTapTapInput,
  callbacks: SubmitToTapTapCallbacks = {},
): Promise<SubmitToTapTapResult> {
  const projectRoot = path.resolve(input.projectRoot);
  const { signal, ...logInput } = input;
  const logger = await createKayingForTaptapOperationLogger("submit_to_taptap", {
    ...logInput,
    projectRoot,
  });
  try {
    if (!(await pathExists(projectRoot))) {
      throw new Error(`Maker project directory does not exist: ${projectRoot}`);
    }
    await assertProductionMakerGitRemote(projectRoot, logger);
    await ensureMainBranchForSubmit(projectRoot, logger);
    // Preserve local .project metadata before the authoritative local push.
    // The patched Maker bundle commits all local resources. If the server has
    // advanced its history, it reconciles only that history with an ours merge;
    // the local file snapshot remains authoritative.
    await restoreClobberedMakerMetadata(projectRoot, logger);
    logger.info("preflight", "Checking cached TapTap authorization", { projectRoot });
    await ensureMakerAuthForSubmit(projectRoot, logger, signal);
    const buildScaffold = await ensureMakerBuildScaffold(projectRoot, {
      requireProjectConfig: true,
    });
    logger.info("build_scaffold", "Verified standard Maker build scaffold", buildScaffold);
    const buildLocation = await resolveMakerBuildLocation(
      projectRoot,
      input.entry,
      input.scriptsPath,
    );
    logger.info("build_preflight", "Resolved Maker script entry and scripts directory", {
      projectRoot,
      ...buildLocation,
    });
    callbacks.onProgress?.({ message: "[preflight] Checking Lua publish diagnostics" });
    const luaPreflight = await runMakerLuaPreflight(
      projectRoot,
      buildLocation.scriptsPath,
      logger.operationId,
      signal,
    );
    const luaAssessment = assessLuaPublishDiagnostics(luaPreflight);
    if (luaAssessment.blocking) {
      logger.error("lua_preflight", "Lua syntax errors blocked submission", luaPreflight);
      throw new Error(formatMakerLuaPreflightFailure(luaAssessment.failure));
    }
    for (const message of luaAssessment.warnings) {
      logger.warn("lua_preflight", message, luaPreflight);
      callbacks.onProgress?.({ message });
    }
    if (!luaAssessment.warnings.length)
      logger.info("lua_preflight", "Lua diagnostics passed", luaPreflight);
    const args = {
      target_dir: projectRoot,
      entry: buildLocation.entry,
      scriptsPath: buildLocation.scriptsPath,
      ...(input.message ? { message: input.message } : {}),
      ...(input.files?.length ? { files: input.files } : {}),
      ...(input.timeoutMs ? { timeout_ms: input.timeoutMs } : {}),
    };
    const result = await callMakerMcpTool({
      cwd: projectRoot,
      name: SUBMIT_TOOL_NAME,
      arguments: args,
      timeoutMs: input.timeoutMs ?? DEFAULT_SUBMIT_TIMEOUT_MS,
      makerEnvironment: input.env,
      logger,
      onProgress: callbacks.onProgress,
      signal,
    });
    const toolResult = readToolResult(result.value);
    const text = extractToolText(toolResult);
    // Maker build returns isError=false even when push fails — the failure is
    // described in the text as "recovery details". Detect push/build failures
    // from the response text so we don't report success when nothing was pushed.
    const failure = detectMakerFailure(toolResult, text);
    const output: Omit<SubmitToTapTapResult, "operationLog"> = {
      ok: !failure,
      warnings: luaAssessment.warnings,
      projectRoot,
      previewUrl: failure ? null : extractTapTapPreviewUrl(text),
      tool: SUBMIT_TOOL_NAME,
      command: result.command,
      text,
      isError: Boolean(toolResult.isError) || Boolean(failure),
      progress: result.progress,
      stderr: result.stderr,
      error:
        failure ??
        (toolResult.isError ? text || result.stderr || "Maker submit failed" : undefined),
    };
    const operationLog = output.ok
      ? await logger.complete(output)
      : await logger.fail(output.error ?? "TapTap submission failed", output);
    return { ...output, operationLog };
  } catch (error) {
    throw await logger.enrichError(error);
  }
}

// Re-export so callers/tests can keep importing the gate from the submit surface.
export { assertProductionMakerGitRemote, PRODUCTION_MAKER_GIT_HOST } from "./git-remote-guard";

async function ensureMainBranchForSubmit(
  projectRoot: string,
  logger: KayingForTaptapOperationLogger,
): Promise<void> {
  const branch = await readGitValue(projectRoot, ["branch", "--show-current"]);
  if (!branch || branch === "main") return;
  const head = await readGitValue(projectRoot, ["rev-parse", "--verify", "HEAD"]);
  if (branch === "master" && !head) {
    logger.warn("git_preflight", "Renaming empty default branch from master to main", {
      projectRoot,
      branch,
    });
    await execFileAsync("git", ["-C", projectRoot, "branch", "-m", "main"]);
    logger.info("git_preflight", "Empty repository branch renamed to main", {
      projectRoot,
      branch: "main",
    });
    return;
  }
  throw new Error(
    [
      "TapTap submission blocked: Maker remote only accepts the main branch.",
      `current_branch: ${branch}`,
      "classification: branch_not_allowed",
      "Switch or migrate the intended changes to main, then retry submission.",
    ].join("\n"),
  );
}

async function readGitValue(projectRoot: string, args: string[]): Promise<string> {
  try {
    const result = await execFileAsync("git", ["-C", projectRoot, ...args]);
    return result.stdout.trim();
  } catch {
    return "";
  }
}

/**
 * Pre-flight auth check before submit/build.
 *
 * The Maker build path (`createRemoteProxyContext`) only reads `tap-auth.json`
 * from disk and throws "Run `taptap-maker login` first" when it is missing —
 * which pushes the agent/user to run `taptap-maker login`, the only flow that
 * opens the browser PAT page. But when a PAT already exists, the TapTap token
 * can be refreshed non-interactively via `maker_status_lite` (no browser).
 *
 * This keeps releases browser-free as long as a PAT is cached, and only asks
 * for an interactive login when the PAT itself is missing.
 */
async function ensureMakerAuthForSubmit(
  projectRoot: string,
  logger: KayingForTaptapOperationLogger,
  signal?: AbortSignal,
): Promise<void> {
  const makerHome = getMakerHome();
  const patPath = path.join(makerHome, "pat.json");
  const tapAuthPath = path.join(makerHome, "tap-auth.json");
  if ((await pathExists(patPath)) && (await pathExists(tapAuthPath))) {
    logger.info("auth", "Cached PAT and TapTap authorization are available");
    return;
  }
  if (!(await pathExists(patPath))) {
    throw new Error(
      [
        "Maker PAT not found. Run `taptap-maker login` once to authorize, then retry the submit.",
        `PAT path: ${patPath}`,
      ].join("\n"),
    );
  }
  // PAT exists but TapTap token missing: refresh non-interactively via status (no browser).
  const statusResult = await callMakerMcpTool({
    cwd: projectRoot,
    name: STATUS_TOOL_NAME,
    arguments: { target_dir: projectRoot, skip_remote_sync: true },
    timeoutMs: DEFAULT_AUTH_REFRESH_TIMEOUT_MS,
    logger,
    signal,
  });
  const statusToolResult = readToolResult(statusResult.value);
  if (statusToolResult.isError) {
    const statusText = extractToolText(statusToolResult);
    throw new Error(
      `Failed to refresh TapTap auth via status: ${statusText || statusResult.stderr || "unknown error"}`,
    );
  }
  if (!(await pathExists(tapAuthPath))) {
    throw new Error(
      [
        "TapTap token could not be refreshed from the cached PAT. The PAT may be expired or revoked.",
        "Run `taptap-maker login` again to refresh authorization, then retry the submit.",
        `PAT path: ${patPath}`,
        `TapTap auth path: ${tapAuthPath}`,
      ].join("\n"),
    );
  }
}

function readToolResult(value: unknown): MakerToolResult {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as MakerToolResult;
  }
  return { isError: true, content: [{ type: "text", text: String(value) }] };
}

function extractToolText(result: MakerToolResult): string {
  const content = result.content ?? [];
  const text = content
    .map((item) => {
      if ("text" in item && typeof item.text === "string") return item.text;
      return JSON.stringify(item);
    })
    .filter(Boolean)
    .join("\n")
    .trim();
  return text || (result.isError ? "Maker submit failed without a text response" : "");
}

/**
 * Detect push/build failures from the Maker MCP response text.
 *
 * `maker_build_current_directory` returns `isError=false` even when push fails —
 * the failure is described in the text content with phrases like
 * "recovery details", "push failed", "merge conflict", etc. (per the tool
 * description). This returns a human-readable failure message when such a
 * failure is detected, or null when the response indicates genuine success.
 */
function detectMakerFailure(result: MakerToolResult, text: string): string | null {
  return detectMakerFailureText(text, Boolean(result.isError));
}

export function detectMakerFailureText(text: string, isError = false): string | null {
  if (isError) {
    return text || "Maker submit failed with an error response";
  }
  const lower = text.toLowerCase();
  if (
    /^failure:\s*$/im.test(text) ||
    /^build_failure:\s*$/im.test(text) ||
    /^\s*-\s*classification:\s*[a-z_]+/im.test(text)
  ) {
    return text || "Maker submit returned structured failure details";
  }
  for (const keyword of MAKER_FAILURE_KEYWORDS) {
    if (lower.includes(keyword)) {
      return text || `Maker submit detected failure: ${keyword}`;
    }
  }
  return null;
}

/** Extract the playable TapTap URL returned by Maker after a successful build. */
export function extractTapTapPreviewUrl(text: string): string | null {
  for (const field of ["preview_url", "previewUrl", "play_url", "game_url", "maker_url"]) {
    const fieldValue = text.match(new RegExp(`^\\s*-?\\s*${field}:\\s*(https?://\\S+)`, "im"))?.[1];
    const url = normalizePreviewUrl(fieldValue);
    if (url) return url;
  }

  for (const line of text.split(/\r?\n/)) {
    if (!/(预览|试玩|preview|play)/i.test(line)) continue;
    const url = extractUrls(line).find((u) => isTapTapHost(u));
    if (url) return url;
  }

  const urls = extractUrls(text);
  return urls.find((u) => isTapTapHost(u)) ?? null;
}

function isTapTapHost(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host.includes("taptap") || host.includes("tapsvc") || host.includes("xindong");
  } catch {
    return false;
  }
}

function extractUrls(text: string): string[] {
  return [...text.matchAll(/https?:\/\/[^\s<>"'`]+/gi)]
    .map((match) => normalizePreviewUrl(match[0]))
    .filter((url): url is string => url !== null);
}

function normalizePreviewUrl(value: string | undefined): string | null {
  if (!value) return null;
  const candidate = value.replace(/[),.;，。；\]}]+$/g, "");
  try {
    const url = new URL(candidate);
    if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username || url.password) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

const MAKER_FAILURE_KEYWORDS = [
  "blocked before commit/push",
  "remote build was not started",
  "remote maker build failed",
  "tool 'build' failed",
  "branch_not_allowed",
  "forbidden_path",
  "recovery details",
  "push failed",
  "push was rejected",
  "merge conflict",
  "could not push",
  "failed to push",
  "remote sync check failed",
  "behind/diverged",
  "not on main",
];
