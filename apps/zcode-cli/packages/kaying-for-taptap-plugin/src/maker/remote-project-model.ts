/** Remote Maker project model parsing and restore-target resolution. */
import { lstat, mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { isDirectory, pathExists } from "../async-files";

export interface MakerRemoteProject {
  id: string;
  name: string;
  /** Last known local checkout. Populated by the desktop app's project registry. */
  localDirectory: string | null;
  createdAt: string | null;
  lastAccessedAt: string | null;
  lastConversationAt: string | null;
  gameType: string | null;
  stage: string | null;
  pinnedAt: string | null;
}

export function parseMakerRemoteProjects(value: string): MakerRemoteProject[] {
  const parsed = parseJson(value);
  if (!Array.isArray(parsed)) throw new Error("TapTap project list returned an invalid payload");
  return parsed
    .map(normalizeRemoteProject)
    .filter((project): project is MakerRemoteProject => project !== null)
    .sort((left, right) => projectActivityTime(right) - projectActivityTime(left));
}

export function parseMakerCommandOutput(value: string): unknown | null {
  if (!value.trim()) return null;
  try {
    return JSON.parse(value.trim()) as unknown;
  } catch {
    return null;
  }
}

export function readInitializedProjectRoot(value: unknown, fallback: string): string {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const projectRoot = (value as Record<string, unknown>).projectRoot;
    if (typeof projectRoot === "string" && projectRoot.trim()) return path.resolve(projectRoot);
  }
  return path.resolve(fallback);
}

export async function prepareMakerRestoreTarget(
  selectedDirectory: string,
  projectName: string,
  appId: string,
  options: { reuseExistingStandard?: boolean } = {},
): Promise<{ projectRoot: string; reusedExisting: boolean }> {
  await mkdir(selectedDirectory, { recursive: true });
  if (!(await isDirectory(selectedDirectory))) {
    throw new Error(`KayingForTaptap restore target must be a directory: ${selectedDirectory}`);
  }
  if ((await lstat(selectedDirectory)).isSymbolicLink()) {
    throw new Error(
      `KayingForTaptap restore target must not be a symbolic link: ${selectedDirectory}`,
    );
  }
  const entries = (await readdir(selectedDirectory)).filter((entry) => entry !== ".DS_Store");
  if (entries.length === 0) return { projectRoot: selectedDirectory, reusedExisting: false };
  if (await isCompleteProjectForApp(selectedDirectory, appId)) {
    return { projectRoot: selectedDirectory, reusedExisting: true };
  }
  if (options.reuseExistingStandard && (await isStandardMakerDirectory(selectedDirectory))) {
    return { projectRoot: selectedDirectory, reusedExisting: true };
  }

  const safeName =
    projectName
      .trim()
      .replace(/[^\p{L}\p{N}._-]+/gu, "-")
      .replace(/^-+|-+$/g, "") || "taptap-game";
  let projectRoot = path.join(selectedDirectory, safeName);
  let suffix = 2;
  while (await pathExists(projectRoot)) {
    projectRoot = path.join(selectedDirectory, `${safeName}-${suffix}`);
    suffix += 1;
  }
  await mkdir(projectRoot);
  return { projectRoot, reusedExisting: false };
}

export function assertAppId(appId: string): void {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{2,127}$/.test(appId)) {
    throw new Error("TapTap project id is invalid");
  }
}

export async function isStandardMakerDirectory(projectRoot: string): Promise<boolean> {
  if (!(await isDirectory(projectRoot))) return false;
  const required = [".git", ".maker-mcp/config.json", ".project/project.json", "assets", "scripts"];
  return (
    await Promise.all(
      required.map((relativePath) => pathExists(path.join(projectRoot, relativePath))),
    )
  ).every(Boolean);
}

async function isCompleteProjectForApp(projectRoot: string, appId: string): Promise<boolean> {
  if (!(await pathExists(path.join(projectRoot, ".git")))) return false;
  if (!(await pathExists(path.join(projectRoot, "scripts", "main.lua")))) return false;
  try {
    const config = JSON.parse(
      await readFileText(path.join(projectRoot, ".maker-mcp", "config.json")),
    ) as unknown;
    return (
      Boolean(config) &&
      typeof config === "object" &&
      !Array.isArray(config) &&
      (config as Record<string, unknown>).project_id === appId
    );
  } catch {
    return false;
  }
}

async function readFileText(target: string): Promise<string> {
  const { readFile } = await import("node:fs/promises");
  return await readFile(target, "utf8");
}

function normalizeRemoteProject(value: unknown): MakerRemoteProject | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || typeof record.name !== "string") return null;
  return {
    id: record.id,
    name: record.name.trim() || "未命名游戏",
    localDirectory: null,
    createdAt: nullableString(record.createdAt),
    lastAccessedAt: nullableString(record.lastAccessedAt),
    lastConversationAt: nullableString(record.lastConversationAt),
    gameType: nullableString(record.gameType),
    stage: nullableString(record.stage),
    pinnedAt: nullableString(record.pinnedAt),
  };
}

function projectActivityTime(project: MakerRemoteProject): number {
  return Math.max(
    0,
    ...[project.lastConversationAt, project.lastAccessedAt, project.pinnedAt, project.createdAt]
      .map((value) => (value ? Date.parse(value) : Number.NaN))
      .filter((value) => !Number.isNaN(value)),
  );
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value.trim()) as unknown;
  } catch {
    throw new Error("TapTap Maker returned invalid JSON");
  }
}
