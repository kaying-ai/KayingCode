/** Converter-generated project artifacts that must survive Maker re-init. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { isFile, pathExists } from "../async-files";

export const CONVERTER_ARTIFACT_PATHS = [
  ".project/kaying-game-converter/acceptance.json",
  ".project/kaying-game-converter/handoff.json",
  ".project/kaying-game-converter/conversion-lock.json",
] as const;

export async function hasConverterArtifacts(projectRoot: string): Promise<boolean> {
  return await pathExists(path.join(projectRoot, CONVERTER_ARTIFACT_PATHS[2]));
}

export async function snapshotConverterArtifacts(
  projectRoot: string,
): Promise<Map<string, Buffer>> {
  const paths = new Set<string>(CONVERTER_ARTIFACT_PATHS);
  const lockPath = path.join(projectRoot, CONVERTER_ARTIFACT_PATHS[2]);
  try {
    const lock = JSON.parse(await readFile(lockPath, "utf8")) as { generatedFiles?: unknown };
    if (Array.isArray(lock.generatedFiles)) {
      for (const relativePath of lock.generatedFiles) {
        if (typeof relativePath === "string" && isSafeProjectPath(relativePath)) {
          paths.add(relativePath);
        }
      }
    }
  } catch {
    // A project without a readable Converter lock has nothing to preserve.
  }
  const snapshot = new Map<string, Buffer>();
  for (const relativePath of paths) {
    const target = path.join(projectRoot, relativePath);
    if (await isFile(target)) {
      snapshot.set(relativePath, await readFile(target));
    }
  }
  return snapshot;
}

export async function restoreConverterArtifacts(
  projectRoot: string,
  snapshot: Map<string, Buffer>,
): Promise<string[]> {
  const restored: string[] = [];
  for (const [relativePath, content] of snapshot) {
    const target = path.join(projectRoot, relativePath);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content);
    restored.push(relativePath);
  }
  return restored;
}

function isSafeProjectPath(relativePath: string): boolean {
  if (relativePath.includes("\\")) return false;
  const normalized = path.posix.normalize(relativePath);
  return (
    normalized === relativePath &&
    !path.posix.isAbsolute(normalized) &&
    !normalized.split("/").includes("..")
  );
}
