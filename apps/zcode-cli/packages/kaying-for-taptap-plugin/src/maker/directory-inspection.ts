/** Inspect whether a target directory is empty, a standard Maker project, or nonstandard. */
import { readdir } from "node:fs/promises";
import path from "node:path";
import { isDirectory, pathExists } from "../async-files";

export type MakerExistingDirectoryStrategy = "reject" | "reset" | "subdirectory" | "reuse";

export interface MakerDirectoryInspection {
  status: "empty" | "standard" | "nonstandard";
  projectRoot: string;
  entries: string[];
  missingDirectories: string[];
  nestedProjects: string[];
  reasons: string[];
  operationLog?: unknown;
}

const STANDARD_REQUIRED_DIRECTORIES = [
  "assets",
  "assets/image",
  "assets/sprites",
  "assets/video",
  "assets/audio",
  "scripts",
];

export async function inspectMakerProjectDirectoryState(
  projectRoot: string,
): Promise<Omit<MakerDirectoryInspection, "operationLog">> {
  const projectRootExists = await pathExists(projectRoot);
  if (projectRootExists && !(await isDirectory(projectRoot))) {
    throw new Error(`KayingForTaptap init target must be a directory: ${projectRoot}`);
  }
  const entries = projectRootExists
    ? (await readdir(projectRoot)).filter((entry) => entry !== ".DS_Store").sort()
    : [];
  const directoryPresence = await Promise.all(
    STANDARD_REQUIRED_DIRECTORIES.map(async (relativeDir) => ({
      relativeDir,
      exists: await pathExists(path.join(projectRoot, relativeDir)),
    })),
  );
  const missingDirectories = directoryPresence
    .filter(({ exists }) => !exists)
    .map(({ relativeDir }) => relativeDir);
  const nestedProjects: string[] = [];
  for (const entry of entries) {
    const child = path.join(projectRoot, entry);
    if (
      (await isDirectory(child)) &&
      ((await pathExists(path.join(child, ".maker-mcp", "config.json"))) ||
        (await pathExists(path.join(child, "scripts", "main.lua"))))
    ) {
      nestedProjects.push(entry);
    }
  }
  if (entries.length === 0) {
    return {
      status: "empty",
      projectRoot,
      entries,
      missingDirectories,
      nestedProjects,
      reasons: [],
    };
  }
  const reasons: string[] = [];
  if (!(await pathExists(path.join(projectRoot, ".git")))) {
    reasons.push("缺少项目独立的 .git 仓库");
  }
  if (!(await pathExists(path.join(projectRoot, ".maker-mcp", "config.json")))) {
    reasons.push("缺少 TapTap Maker 项目绑定信息");
  }
  if (missingDirectories.length > 0) {
    reasons.push(`缺少标准目录：${missingDirectories.join(", ")}`);
  }
  if (nestedProjects.length > 0) {
    reasons.push(`检测到嵌套游戏目录：${nestedProjects.join(", ")}`);
  }
  return {
    status: reasons.length === 0 ? "standard" : "nonstandard",
    projectRoot,
    entries,
    missingDirectories,
    nestedProjects,
    reasons,
  };
}
