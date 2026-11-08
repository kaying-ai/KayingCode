/** Resolve the concrete directory Maker init should write into. */
import { lstat, mkdir, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathExists } from "../async-files";
import type { KayingForTaptapOperationLogger } from "../operations/logging";
import type { MakerDirectoryInspection, MakerExistingDirectoryStrategy } from "./directory-inspection";

export async function prepareInitTarget(input: {
  requestedProjectRoot: string;
  inspection: Omit<MakerDirectoryInspection, "operationLog">;
  strategy: MakerExistingDirectoryStrategy;
  name?: string;
  logger: KayingForTaptapOperationLogger;
}): Promise<string> {
  if (input.inspection.status === "empty") {
    await mkdir(input.requestedProjectRoot, { recursive: true });
    return input.requestedProjectRoot;
  }
  if (input.inspection.status === "standard") {
    if (input.strategy === "reuse") return input.requestedProjectRoot;
    throw new Error(`TapTap standard project already exists: ${input.requestedProjectRoot}`);
  }
  if (input.strategy === "reuse") {
    throw new Error(
      `existingDirectory=reuse requires a standard TapTap project: ${input.requestedProjectRoot}`,
    );
  }
  if (input.strategy === "reset") {
    await resetDirectoryContents(input.requestedProjectRoot, input.logger);
    return input.requestedProjectRoot;
  }
  if (input.strategy === "subdirectory") {
    const projectRoot = await resolveFreshProjectSubdirectory(
      input.requestedProjectRoot,
      input.name,
    );
    await mkdir(projectRoot, { recursive: true });
    input.logger.info("directory_strategy", "Created a fresh project subdirectory", {
      requestedProjectRoot: input.requestedProjectRoot,
      projectRoot,
    });
    return projectRoot;
  }
  throw new Error(
    [
      `Non-standard KayingForTaptap directory requires confirmation: ${input.requestedProjectRoot}`,
      "ACTION REQUIRED: retry this call with existingDirectory=subdirectory (creates a fresh child project and preserves all existing files)",
      "or existingDirectory=reset with confirmReset=true (clears and reinitializes the directory).",
      ...input.inspection.reasons.map((reason) => `- ${reason}`),
    ].join("\n"),
  );
}

async function resetDirectoryContents(
  projectRoot: string,
  logger: KayingForTaptapOperationLogger,
): Promise<void> {
  await assertSafeResetTarget(projectRoot);
  const entries = await readdir(projectRoot);
  logger.warn("directory_reset_before", "Resetting confirmed non-standard project directory", {
    projectRoot,
    entries,
  });
  for (const entry of entries) {
    const target = path.resolve(projectRoot, entry);
    if (!target.startsWith(`${projectRoot}${path.sep}`)) {
      throw new Error(`Unsafe reset entry outside project root: ${target}`);
    }
    await rm(target, { recursive: true, force: true });
  }
  logger.info("directory_reset_after", "Project directory reset completed", { projectRoot });
}

async function assertSafeResetTarget(projectRoot: string): Promise<void> {
  const root = path.parse(projectRoot).root;
  const depth = path.relative(root, projectRoot).split(path.sep).filter(Boolean).length;
  if (projectRoot === root || projectRoot === path.resolve(os.homedir()) || depth < 2) {
    throw new Error(`Refusing to reset unsafe project path: ${projectRoot}`);
  }
  if ((await lstat(projectRoot)).isSymbolicLink()) {
    throw new Error(`Refusing to reset a symbolic-link project directory: ${projectRoot}`);
  }
}

async function resolveFreshProjectSubdirectory(
  projectRoot: string,
  name?: string,
): Promise<string> {
  const requestedName = name?.trim() || `${path.basename(projectRoot)}-game`;
  const safeName = requestedName.replace(/[^\p{L}\p{N}._-]+/gu, "-").replace(/^-+|-+$/g, "");
  const baseName = safeName || "taptap-game";
  let candidate = path.join(projectRoot, baseName);
  let suffix = 2;
  while (await pathExists(candidate)) {
    candidate = path.join(projectRoot, `${baseName}-${suffix}`);
    suffix += 1;
  }
  return candidate;
}
