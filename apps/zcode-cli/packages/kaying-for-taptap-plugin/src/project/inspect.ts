/** Canonical KayingForTaptap project detection, entry resolution, and file scanning. */

import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { isDirectory, isFile, pathExists } from "../async-files";
import type {
  KayingForTaptapEntryResolution,
  KayingForTaptapProjectDetection,
  KayingForTaptapProjectFile,
  KayingForTaptapProjectScanOptions,
} from "./types";

const DEFAULT_FILE_LIMIT = 1_000;
const PROJECT_CONFIG_PATH = path.join(".project", "project.json");
const MAKER_CONFIG_PATH = path.join(".maker-mcp", "config.json");

const ASSET_KIND_BY_EXTENSION: Record<string, KayingForTaptapProjectFile["kind"]> = {
  ".png": "image",
  ".jpg": "image",
  ".jpeg": "image",
  ".webp": "image",
  ".gif": "image",
  ".svg": "image",
  ".mp4": "video",
  ".webm": "video",
  ".mov": "video",
  ".mp3": "audio",
  ".wav": "audio",
  ".ogg": "audio",
  ".flac": "audio",
  ".glb": "model",
  ".gltf": "model",
  ".fbx": "model",
  ".obj": "model",
};

export async function detectKayingForTaptapProject(
  projectRootInput: string,
  options: KayingForTaptapProjectScanOptions = {},
): Promise<KayingForTaptapProjectDetection> {
  const projectRoot = path.resolve(projectRootInput);
  await assertProjectDirectory(projectRoot);
  const warnings: string[] = [];
  const projectConfigPath = path.join(projectRoot, PROJECT_CONFIG_PATH);
  const makerConfigPath = path.join(projectRoot, MAKER_CONFIG_PATH);
  const [hasProjectConfig, hasMakerMcpConfig] = await Promise.all([
    pathExists(projectConfigPath),
    pathExists(makerConfigPath),
  ]);
  const [projectConfigValue, makerConfig] = await Promise.all([
    readJsonObject(projectConfigPath, warnings),
    readJsonObject(makerConfigPath, warnings),
  ]);
  const projectConfig = normalizeProjectConfig(projectConfigValue);
  validateProjectConfig(projectConfig, warnings);
  validateMakerConfig(makerConfig, warnings);
  const configuredEntry =
    stringValue(projectConfig?.entry) ?? (await discoverDefaultEntry(projectRoot));
  const [entryResolution, hasWorkbench, hasMakerRegistry, hasAgentsPolicy, files] =
    await Promise.all([
      resolveKayingForTaptapEntry(projectRoot, configuredEntry),
      pathExists(path.join(projectRoot, "scripts", "Workbench", "init.lua")),
      pathExists(path.join(projectRoot, "scripts", "Workbench", "Maker", "Registry.lua")),
      pathExists(path.join(projectRoot, "AGENTS.md")),
      listKayingForTaptapProjectFiles(projectRoot, options),
    ]);
  const [scripts, assets, templates, engineDocs, urhoxLibs] = await Promise.all([
    pathExists(path.join(projectRoot, "scripts")),
    pathExists(path.join(projectRoot, "assets")),
    pathExists(path.join(projectRoot, "templates")),
    pathExists(path.join(projectRoot, "engine-docs")),
    pathExists(path.join(projectRoot, "urhox-libs")),
  ]);

  if (entryResolution.error) warnings.push(entryResolution.error);
  if (configuredEntry && entryResolution.valid && !entryResolution.exists) {
    warnings.push(`Entry script is missing: ${configuredEntry}`);
  }
  if (!hasAgentsPolicy) warnings.push("AGENTS.md policy is missing");
  if (!hasWorkbench) warnings.push("Workbench facade is missing: scripts/Workbench/init.lua");

  return {
    projectRoot,
    isKayingForTaptapProject:
      hasProjectConfig || hasMakerMcpConfig || hasWorkbench || hasMakerRegistry,
    projectConfig,
    makerConfig,
    entry: configuredEntry,
    entryPath: entryResolution.absolutePath,
    entryResolution,
    projectId: stringValue(projectConfig?.project_id) ?? stringValue(makerConfig?.project_id),
    makerProjectId: stringValue(makerConfig?.project_id),
    name:
      stringValue(projectConfig?.name) ??
      stringValue(projectConfig?.title) ??
      nestedStringValue(projectConfig, "taptap_publish", "title"),
    version: stringValue(projectConfig?.version),
    hasAgentsPolicy,
    hasWorkbench,
    hasMakerRegistry,
    hasMakerMcpConfig,
    directories: {
      scripts,
      assets,
      templates,
      engineDocs,
      urhoxLibs,
    },
    files,
    scriptFiles: files
      .filter((file) => file.kind === "script" && path.extname(file.path).toLowerCase() === ".lua")
      .map((file) => file.path),
    assetCounts: countKayingForTaptapAssets(files),
    warnings,
  };
}

export async function resolveKayingForTaptapEntry(
  projectRootInput: string,
  configuredEntry?: string | null,
): Promise<KayingForTaptapEntryResolution> {
  const projectRoot = path.resolve(projectRootInput);
  const entry = configuredEntry?.trim() || null;
  if (!entry) return emptyEntryResolution();

  const scriptsRoot = path.join(projectRoot, "scripts");
  const normalizedEntry = entry.replaceAll("\\", "/").replace(/^\.\//, "");
  const candidate = path.isAbsolute(entry)
    ? path.resolve(entry)
    : normalizedEntry === "scripts" || normalizedEntry.startsWith("scripts/")
      ? path.resolve(projectRoot, normalizedEntry)
      : path.resolve(scriptsRoot, normalizedEntry);
  const projectRelativePath = relativeInside(projectRoot, candidate);
  if (projectRelativePath === null) {
    return invalidEntry(entry, `Entry must stay inside the project root: ${entry}`);
  }
  const scriptsRelativePath = relativeInside(scriptsRoot, candidate);
  if (scriptsRelativePath === null) {
    return invalidEntry(entry, `Entry must stay inside the scripts directory: ${entry}`);
  }
  if (!scriptsRelativePath || scriptsRelativePath === ".") {
    return invalidEntry(entry, `Entry must resolve to a file inside scripts: ${entry}`);
  }
  return {
    configuredEntry: entry,
    projectRelativePath: toPosix(projectRelativePath),
    scriptsRelativePath: toPosix(scriptsRelativePath),
    absolutePath: candidate,
    valid: true,
    exists: await isFile(candidate),
    error: null,
  };
}

export async function listKayingForTaptapProjectFiles(
  projectRootInput: string,
  options: KayingForTaptapProjectScanOptions = {},
): Promise<KayingForTaptapProjectFile[]> {
  const projectRoot = path.resolve(projectRootInput);
  const limit = Math.max(1, options.limit ?? DEFAULT_FILE_LIMIT);
  const files: KayingForTaptapProjectFile[] = [];
  await pushKnownFile(files, projectRoot, PROJECT_CONFIG_PATH, "config");
  await pushKnownFile(files, projectRoot, MAKER_CONFIG_PATH, "config");
  await walkFiles(projectRoot, path.join(projectRoot, "scripts"), limit, files, () => "script");
  await walkFiles(projectRoot, path.join(projectRoot, "assets"), limit, files, assetKind);
  return files.sort((left, right) => left.path.localeCompare(right.path, "en"));
}

export function countKayingForTaptapAssets(
  files: KayingForTaptapProjectFile[],
): Record<string, number> {
  const result: Record<string, number> = {
    image: 0,
    video: 0,
    audio: 0,
    model: 0,
    asset: 0,
  };
  for (const file of files) {
    if (file.path.startsWith("assets/") && file.kind in result) result[file.kind] += 1;
  }
  return result;
}

async function walkFiles(
  projectRoot: string,
  directory: string,
  limit: number,
  files: KayingForTaptapProjectFile[],
  kindForPath: (filePath: string) => KayingForTaptapProjectFile["kind"],
): Promise<void> {
  if (!(await pathExists(directory)) || files.length >= limit) return;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (files.length >= limit) break;
    if (entry.name.startsWith(".")) continue;
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await walkFiles(projectRoot, filePath, limit, files, kindForPath);
    } else if (entry.isFile()) {
      files.push({
        path: toPosix(path.relative(projectRoot, filePath)),
        kind: kindForPath(filePath),
        size: (await stat(filePath)).size,
      });
    }
  }
}

async function pushKnownFile(
  files: KayingForTaptapProjectFile[],
  projectRoot: string,
  relativePath: string,
  kind: KayingForTaptapProjectFile["kind"],
): Promise<void> {
  const filePath = path.join(projectRoot, relativePath);
  if (!(await isFile(filePath))) return;
  files.push({ path: toPosix(relativePath), kind, size: (await stat(filePath)).size });
}

function assetKind(filePath: string): KayingForTaptapProjectFile["kind"] {
  return ASSET_KIND_BY_EXTENSION[path.extname(filePath).toLowerCase()] ?? "asset";
}

async function readJsonObject(
  filePath: string,
  warnings: string[],
): Promise<Record<string, unknown> | null> {
  if (!(await pathExists(filePath))) return null;
  try {
    const parsed = JSON.parse(await readFile(filePath, "utf8")) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    warnings.push(`JSON config must contain an object: ${filePath}`);
  } catch (error) {
    warnings.push(
      `Invalid JSON config: ${filePath} (${error instanceof Error ? error.message : String(error)})`,
    );
  }
  return null;
}

function validateProjectConfig(config: Record<string, unknown> | null, warnings: string[]): void {
  if (!config) return;
  validateOptionalString(config, "entry", ".project/project.json", warnings);
  validateOptionalString(config, "name", ".project/project.json", warnings);
  validateOptionalString(config, "title", ".project/project.json", warnings);
  validateOptionalString(config, "project_id", ".project/project.json", warnings);
  validateOptionalString(config, "version", ".project/project.json", warnings);
  if (config.taptap_publish !== undefined) {
    const publish = config.taptap_publish;
    if (!publish || typeof publish !== "object" || Array.isArray(publish)) {
      warnings.push(".project/project.json field taptap_publish must be an object");
    } else {
      validateOptionalString(
        publish as Record<string, unknown>,
        "title",
        ".project/project.json taptap_publish",
        warnings,
      );
    }
  }
}

function normalizeProjectConfig(
  config: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (!config) return null;
  const structure = stringValue(config.structure);
  if (structure?.startsWith("modular-") === true) {
    return { ...config, structure: "modular" };
  }
  return config;
}

async function discoverDefaultEntry(projectRoot: string): Promise<string | null> {
  return (await isFile(path.join(projectRoot, "scripts", "main.lua"))) ? "scripts/main.lua" : null;
}

function validateMakerConfig(config: Record<string, unknown> | null, warnings: string[]): void {
  if (!config) return;
  validateOptionalString(config, "project_id", ".maker-mcp/config.json", warnings);
}

function validateOptionalString(
  record: Record<string, unknown>,
  key: string,
  label: string,
  warnings: string[],
): void {
  if (record[key] !== undefined && stringValue(record[key]) === null) {
    warnings.push(`${label} field ${key} must be a non-empty string`);
  }
}

async function assertProjectDirectory(projectRoot: string): Promise<void> {
  if (!(await pathExists(projectRoot)))
    throw new Error(`projectRoot does not exist: ${projectRoot}`);
  if (!(await isDirectory(projectRoot))) {
    throw new Error(`projectRoot must be a directory: ${projectRoot}`);
  }
}

function emptyEntryResolution(): KayingForTaptapEntryResolution {
  return {
    configuredEntry: null,
    projectRelativePath: null,
    scriptsRelativePath: null,
    absolutePath: null,
    valid: true,
    exists: false,
    error: null,
  };
}

function invalidEntry(configuredEntry: string, error: string): KayingForTaptapEntryResolution {
  return {
    configuredEntry,
    projectRelativePath: null,
    scriptsRelativePath: null,
    absolutePath: null,
    valid: false,
    exists: false,
    error,
  };
}

function relativeInside(root: string, target: string): string | null {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  if (relative.startsWith("..") || path.isAbsolute(relative)) return null;
  return relative;
}

function nestedStringValue(
  record: Record<string, unknown> | null,
  parent: string,
  key: string,
): string | null {
  const value = record?.[parent];
  return value && typeof value === "object" && !Array.isArray(value)
    ? stringValue((value as Record<string, unknown>)[key])
    : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function toPosix(value: string): string {
  return value.replaceAll("\\", "/");
}
