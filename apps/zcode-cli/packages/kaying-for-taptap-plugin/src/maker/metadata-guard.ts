/**
 * Protects local `.project` metadata from remote Maker sync commits.
 *
 * After every successful push the Maker remote appends a "sync" commit
 * (authored by `TapCode Rollback <rollback@code.taptap.cn>`) that resets the
 * project to the remote's template view: it deletes `surfaces.json`,
 * `material-bindings.json`, `ui-theme.json`, `modules.json`, the whole
 * `gameflow/` state directory, and rewrites `project.json` into an unfilled
 * TapTap template. When that commit is pulled or rebased into the local
 * branch, visual provenance and Flow state can be lost. Publication does not
 * require this metadata; restoration preserves useful local authoring context.
 *
 * This guard inspects git history: whenever a protected file is missing on
 * disk but was deleted by a remote sync commit, it restores the pre-sync
 * version from git history and commits the restoration, so the next Maker
 * push re-publishes the local metadata. Locally authored deletions are never
 * touched — only deletions made by the remote sync bot are restored.
 */

import { execFile } from "node:child_process";
import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { pathExists } from "../async-files";
import { createKayingForTaptapOperationLogger } from "../operations/logging";

const execFileAsync = promisify(execFile);

/** Author email suffix used by remote Maker sync commits ("TapCode Rollback"). */
const REMOTE_SYNC_AUTHOR_EMAIL_SUFFIX = "@code.taptap.cn";

/**
 * `.project` metadata authored locally that a remote Maker sync commit
 * deletes when it lands in the local branch.
 */
const PROTECTED_METADATA_PATHS = [
  ".project/surfaces.json",
  ".project/material-bindings.json",
  ".project/ui-theme.json",
  ".project/modules.json",
  ".project/kaying-game-converter",
  ".project/gameflow",
];

const PROJECT_CONFIG_PATH = ".project/project.json";
/** Placeholder only present in the unfilled TapTap project.json template written by remote sync. */
const PROJECT_CONFIG_TEMPLATE_MARKER = "<game title, required>";
const RESTORE_COMMIT_MESSAGE = "chore: restore .project metadata reset by remote Maker sync";
const PROJECT_CONFIG_HISTORY_LIMIT = 30;

export interface MakerMetadataRestoreResult {
  restoredFiles: string[];
  commit: string | null;
}

interface MetadataGuardLogger {
  info: (phase: string, message: string, data?: unknown) => void;
  warn: (phase: string, message: string, data?: unknown) => void;
}

/**
 * Restore `.project` metadata that a remote Maker sync commit deleted or
 * reset. Non-fatal by design: on any git failure the guard logs a warning and
 * leaves the project as-is so the surrounding submit flow can still surface
 * the problem through readiness checks.
 */
export async function restoreClobberedMakerMetadata(
  projectRootInput: string,
  externalLogger?: MetadataGuardLogger,
  options: { logDir?: string } = {},
): Promise<MakerMetadataRestoreResult> {
  const projectRoot = path.resolve(projectRootInput);
  const result: MakerMetadataRestoreResult = { restoredFiles: [], commit: null };
  if (!(await pathExists(projectRoot))) return result;
  if (!(await isProjectRepoRoot(projectRoot))) return result;
  if (!(await hasClobberedMetadata(projectRoot))) return result;

  const logger = await createKayingForTaptapOperationLogger(
    "restore_project_metadata",
    { projectRoot },
    options,
  );
  const logInfo = (phase: string, message: string, data?: unknown) => {
    logger.info(phase, message, data);
    externalLogger?.info(phase, message, data);
  };
  const logWarn = (phase: string, message: string, data?: unknown) => {
    logger.warn(phase, message, data);
    externalLogger?.warn(phase, message, data);
  };
  logger.info("before", "Remote sync metadata clobber detected", { projectRoot });
  try {
    for (const relativePath of PROTECTED_METADATA_PATHS) {
      await restoreDeletedPath(projectRoot, relativePath, result);
    }
    await restoreTemplatedProjectConfig(projectRoot, result);
    if (result.restoredFiles.length > 0) {
      result.commit = await commitRestoredFiles(projectRoot, result.restoredFiles);
      logInfo("restore", "Restored .project metadata reset by remote Maker sync", {
        restoredFiles: result.restoredFiles,
        commit: result.commit,
      });
    }
    await logger.complete(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logWarn("restore", "Metadata restore failed; continuing without full restoration", {
      message,
      restoredFiles: result.restoredFiles,
    });
    await logger.fail(error, result);
  }
  return result;
}

/** True when any protected file is missing or project.json is an unfilled template. */
async function hasClobberedMetadata(projectRoot: string): Promise<boolean> {
  for (const relativePath of PROTECTED_METADATA_PATHS) {
    if (!(await pathExists(path.join(projectRoot, relativePath)))) return true;
  }
  const projectConfigPath = path.join(projectRoot, PROJECT_CONFIG_PATH);
  if (await pathExists(projectConfigPath)) {
    try {
      const content = await readFile(projectConfigPath, "utf8");
      if (content.includes(PROJECT_CONFIG_TEMPLATE_MARKER)) return true;
    } catch {
      // Unreadable config is handled by the regular readiness checks.
    }
  }
  return false;
}

/** Restore a protected path (file or directory) deleted by a remote sync commit. */
async function restoreDeletedPath(
  projectRoot: string,
  relativePath: string,
  result: MakerMetadataRestoreResult,
): Promise<void> {
  if (await pathExists(path.join(projectRoot, relativePath))) return;
  const deletion = await findRemoteSyncDeletion(projectRoot, relativePath);
  if (!deletion) return;
  const parentTree = `${deletion.commit}^`;
  const files = await listHistoricalFiles(projectRoot, parentTree, relativePath);
  for (const file of files) {
    const target = path.join(projectRoot, file);
    if (await pathExists(target)) continue;
    const content = await readHistoricalFile(projectRoot, parentTree, file);
    if (content === null) continue;
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content);
    result.restoredFiles.push(file);
  }
}

/**
 * Find the newest commit that deleted `relativePath`. Only deletions authored
 * by the remote sync bot qualify — a locally authored deletion is intentional
 * and must not be resurrected.
 */
async function findRemoteSyncDeletion(
  projectRoot: string,
  relativePath: string,
): Promise<{ commit: string } | null> {
  let output: string;
  try {
    output = await git(projectRoot, [
      "log",
      "-n",
      "1",
      "--diff-filter=D",
      "--format=%H %ae",
      "--",
      relativePath,
    ]);
  } catch {
    return null;
  }
  const line = output.trim().split("\n")[0]?.trim() ?? "";
  const separator = line.lastIndexOf(" ");
  if (separator <= 0) return null;
  const email = line.slice(separator + 1).toLowerCase();
  if (!email.endsWith(REMOTE_SYNC_AUTHOR_EMAIL_SUFFIX)) return null;
  return { commit: line.slice(0, separator) };
}

/**
 * Restore `project.json` when the remote sync commit replaced it with the
 * unfilled TapTap template (detected via the placeholder title). The most
 * recent historical version without the placeholder is restored; projects
 * whose project.json has always been the template are left untouched.
 */
async function restoreTemplatedProjectConfig(
  projectRoot: string,
  result: MakerMetadataRestoreResult,
): Promise<void> {
  const projectConfigPath = path.join(projectRoot, PROJECT_CONFIG_PATH);
  if (!(await pathExists(projectConfigPath))) return;
  let current: string;
  try {
    current = await readFile(projectConfigPath, "utf8");
  } catch {
    return;
  }
  if (!current.includes(PROJECT_CONFIG_TEMPLATE_MARKER)) return;
  const historical = await findPreTemplateProjectConfig(projectRoot);
  if (historical === null) return;
  await writeFile(projectConfigPath, historical);
  result.restoredFiles.push(PROJECT_CONFIG_PATH);
}

async function findPreTemplateProjectConfig(projectRoot: string): Promise<string | null> {
  let hashes: string[];
  try {
    const output = await git(projectRoot, [
      "log",
      "--format=%H",
      "-n",
      String(PROJECT_CONFIG_HISTORY_LIMIT),
      "--",
      PROJECT_CONFIG_PATH,
    ]);
    hashes = output
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    return null;
  }
  for (const hash of hashes) {
    const content = await readHistoricalFileText(projectRoot, hash, PROJECT_CONFIG_PATH);
    if (content !== null && !content.includes(PROJECT_CONFIG_TEMPLATE_MARKER)) return content;
  }
  return null;
}

async function commitRestoredFiles(projectRoot: string, files: string[]): Promise<string | null> {
  try {
    await git(projectRoot, ["add", "--", ...files]);
    await git(projectRoot, ["commit", "-m", RESTORE_COMMIT_MESSAGE, "--", ...files]);
    const hash = (await git(projectRoot, ["rev-parse", "--short", "HEAD"])).trim();
    return hash || null;
  } catch {
    // Restored files remain on disk uncommitted — the Maker push flow
    // commits local changes itself, so the restoration still ships.
    return null;
  }
}

/** True when the project root is itself the git repository root. */
async function isProjectRepoRoot(projectRoot: string): Promise<boolean> {
  try {
    const toplevel = (await git(projectRoot, ["rev-parse", "--show-toplevel"])).trim();
    if (!toplevel) return false;
    return (await realpath(toplevel)) === (await realpath(projectRoot));
  } catch {
    return false;
  }
}

async function listHistoricalFiles(
  projectRoot: string,
  treeish: string,
  relativePath: string,
): Promise<string[]> {
  try {
    const output = await git(projectRoot, [
      "ls-tree",
      "-r",
      "--name-only",
      treeish,
      "--",
      relativePath,
    ]);
    return output
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

async function readHistoricalFile(
  projectRoot: string,
  treeish: string,
  relativePath: string,
): Promise<Buffer | null> {
  try {
    const output = await execFileAsync("git", [
      "-C",
      projectRoot,
      "show",
      `${treeish}:${relativePath}`,
    ]);
    return Buffer.from(output.stdout, "utf8");
  } catch {
    return null;
  }
}

async function readHistoricalFileText(
  projectRoot: string,
  treeish: string,
  relativePath: string,
): Promise<string | null> {
  try {
    return await git(projectRoot, ["show", `${treeish}:${relativePath}`]);
  } catch {
    return null;
  }
}

async function git(projectRoot: string, args: string[]): Promise<string> {
  const result = await execFileAsync("git", ["-C", projectRoot, ...args]);
  return result.stdout;
}
