/** Initialize only remote binding metadata, without handing generated files to Maker init. */
import fs from "node:fs/promises";
import path from "node:path";
import { ensureMakerBuildScaffold } from "./build-scaffold";
import { initMakerProject } from "./setup";

export async function bindConverterProject(
  root: string,
  name: string,
  initialize = initMakerProject,
): Promise<string> {
  const config = path.join(root, ".maker-mcp/config.json");
  if (await exists(config)) {
    if (!(await exists(path.join(root, ".git"))))
      throw new Error("TapTap binding is missing its Git checkout");
    await ensureMetadata(root, name);
    return readProjectId(config);
  }
  // Maker init accepts an empty directory, not an unbound generated project.
  // Keep its scaffold separate; only move the fresh Git/binding metadata into
  // the authoritative project. Never copy a different game's scripts/login/runtime.
  const staging = path.join(path.dirname(root), "work", "maker-binding");
  for (const target of [path.dirname(staging), staging]) await assertNoLink(target);
  await fs.mkdir(staging, { recursive: true });
  const stagedConfig = path.join(staging, ".maker-mcp/config.json");
  for (const relative of [".git", ".maker-mcp", ".maker-mcp/config.json"])
    await assertNoLink(path.join(staging, relative));
  if (!(await exists(stagedConfig))) {
    if ((await fs.readdir(staging)).length) {
      throw new Error(
        `Incomplete Maker initialization at ${staging}. Inspect it before retrying to avoid creating a duplicate platform project.`,
      );
    }
    const result = await initialize({ projectRoot: staging, name });
    if (!result.ok)
      throw new Error(result.error || result.stderr || "TapTap project creation failed");
  }
  const projectId = await readProjectId(stagedConfig);
  for (const relative of [".git", ".maker-mcp"]) {
    const from = path.join(staging, relative);
    const to = path.join(root, relative);
    if (await exists(to)) {
      if (await exists(from))
        throw new Error(`Existing ${relative} conflicts with the new TapTap binding`);
    } else {
      await fs.rename(from, to);
    }
  }
  await ensureMetadata(root, name);
  return projectId;
}

async function ensureMetadata(root: string, name: string): Promise<void> {
  await ensureMakerBuildScaffold(root);
  const metadata = path.join(root, ".project/project.json");
  if (!(await exists(metadata))) {
    await fs.writeFile(
      metadata,
      JSON.stringify(
        { name, title: name, version: "1.0.0", engine: "taptap", entry: "scripts/main.lua" },
        null,
        2,
      ),
      { flag: "wx" },
    );
  }
}

async function readProjectId(config: string): Promise<string> {
  const value = JSON.parse(await fs.readFile(config, "utf8")) as { project_id?: unknown };
  if (typeof value.project_id !== "string" || !value.project_id.trim())
    throw new Error("Maker project binding has no project id");
  return value.project_id;
}

async function exists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function assertNoLink(target: string): Promise<void> {
  try {
    if ((await fs.lstat(target)).isSymbolicLink())
      throw new Error(`Maker binding path contains a symlink: ${target}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}
