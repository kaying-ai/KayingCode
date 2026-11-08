import path from "node:path";
import { detectKayingForTaptapProject, resolveKayingForTaptapEntry } from "../project/inspect";

export interface MakerBuildLocation {
  entry: string;
  scriptsPath: string;
  entryPath: string;
}

/** Resolve the shared KayingForTaptap entry into Maker's scriptsPath + entry arguments. */
export async function resolveMakerBuildLocation(
  projectRoot: string,
  requestedEntry?: string,
  requestedScriptsPath?: string,
): Promise<MakerBuildLocation> {
  const root = path.resolve(projectRoot);
  const project = await detectKayingForTaptapProject(root, { limit: 1 });
  const configuredEntry = project.entry ?? "main.lua";
  const scriptsDirectory = requestedScriptsPath
    ? resolveRequestedScriptsDirectory(root, requestedScriptsPath)
    : null;
  const entryInput = requestedEntry ?? configuredEntry;
  const resolution =
    scriptsDirectory && requestedEntry
      ? await resolveKayingForTaptapEntry(
          root,
          path.resolve(scriptsDirectory, normalizeRelative(requestedEntry, "entry")),
        )
      : await resolveKayingForTaptapEntry(root, entryInput);

  if (!resolution.valid || !resolution.absolutePath || !resolution.exists) {
    throw new Error(
      [
        "TapTap submission blocked: Lua entry file was not found or is outside scripts.",
        `entry: ${entryInput}`,
        `scriptsPath: ${requestedScriptsPath ?? "scripts"}`,
        `detail: ${resolution.error ?? "entry_not_found"}`,
        "classification: entry_not_found",
      ].join("\n"),
    );
  }
  if (scriptsDirectory && !isInside(scriptsDirectory, resolution.absolutePath)) {
    throw new Error("entry must stay inside the requested scriptsPath");
  }

  const entryDirectory = path.dirname(resolution.absolutePath);
  return {
    entry: path.basename(resolution.absolutePath).replaceAll("\\", "/"),
    scriptsPath: path.relative(root, entryDirectory).replaceAll("\\", "/"),
    entryPath: resolution.absolutePath,
  };
}

function resolveRequestedScriptsDirectory(projectRoot: string, value: string): string {
  const relativePath = normalizeRelative(value, "scriptsPath");
  const scriptsDirectory = path.resolve(projectRoot, relativePath);
  const scriptsRoot = path.join(projectRoot, "scripts");
  if (!isInside(scriptsRoot, scriptsDirectory)) {
    throw new Error("scriptsPath must stay inside the KayingForTaptap scripts directory");
  }
  return scriptsDirectory;
}

function normalizeRelative(value: string, label: string): string {
  const normalized = value.trim().replaceAll("\\", "/").replace(/^\.\//, "");
  if (!normalized || path.posix.isAbsolute(normalized)) {
    throw new Error(`${label} must be a non-empty project-relative path`);
  }
  return normalized;
}

function isInside(root: string, target: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}
