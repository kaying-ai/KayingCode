import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, posix, relative, resolve, sep } from "node:path";
import * as yauzl from "yauzl";
import {
  appendPluginSourceCleanupError,
  cleanupPluginSourceBestEffort,
  directoryExists,
  fileExists,
} from "./helpers.js";

const ZIP_EXTRACT_MAX_BYTES = 500 * 1024 * 1024;
const ZIP_MAX_ENTRIES = 20_000;
const ZIP_MAX_SINGLE_FILE_BYTES = 50 * 1024 * 1024;
const ZIP_TEMP_PREFIX = "kayingcode-plugin-zip-";
const ZIP_REQUIRED_SHA256_PATTERN = /^[a-f0-9]{64}$/u;

export interface ResolvedZipPluginSourceRoot {
  cleanup: () => Promise<void>;
  path: string;
}

export interface ResolveZipPluginSourceInput {
  headers?: Record<string, string>;
  path?: string;
  sha256: string;
  signal?: AbortSignal;
  stripRoot?: boolean;
  url: string;
}

export interface ResolveHttpZipSourceInput {
  headers?: Record<string, string>;
  path?: string;
  requireSingleRoot?: boolean;
  sha256?: string;
  signal?: AbortSignal;
  stripRoot?: boolean;
  url: string;
}

interface ZipExtractResult {
  topLevelSegments: Set<string>;
}

type ZipEntryKind = "directory" | "file";

export async function resolveZipPluginSource(
  input: ResolveZipPluginSourceInput,
): Promise<ResolvedZipPluginSourceRoot> {
  validateZipSourceInput(input);
  if (!/^file:/i.test(input.url) && !isAbsolute(input.url)) {
    throw new Error(
      "Remote plugin zip download is disabled in KayingCode (use a local zip path)",
    );
  }
  const localPath = input.url.startsWith("file:") ? fileURLToPath(input.url) : input.url;
  return extractLocalZipArchive({
    path: input.path,
    sha256: input.sha256,
    stripRoot: input.stripRoot,
    zipPath: localPath,
    signal: input.signal,
  });
}

async function extractLocalZipArchive(input: {
  path?: string;
  sha256: string;
  signal?: AbortSignal;
  stripRoot?: boolean;
  zipPath: string;
}): Promise<ResolvedZipPluginSourceRoot> {
  const tempRoot = await mkdtemp(join(tmpdir(), ZIP_TEMP_PREFIX));
  const extractRoot = join(tempRoot, "extract");
  const cleanup = async (): Promise<void> => {
    await rm(tempRoot, { force: true, recursive: true });
  };
  try {
    const archiveBytes = await readFile(input.zipPath);
    if (input.sha256 !== undefined) {
      const digest = createHash("sha256").update(archiveBytes).digest("hex");
      if (digest.toLowerCase() !== input.sha256.toLowerCase()) {
        throw new Error("Plugin zip source sha256 mismatch");
      }
    }
    const archivePath = join(tempRoot, "source.zip");
    await writeFile(archivePath, archiveBytes);
    const extracted = await extractZipArchive({
      archivePath,
      signal: input.signal,
      targetRoot: extractRoot,
    });
    const resolvedRoot = resolveZipRoot({
      extractRoot,
      path: input.path,
      stripRoot: input.stripRoot,
      topLevelSegments: extracted.topLevelSegments,
    });
    return { cleanup, path: resolvedRoot };
  } catch (error) {
    await cleanup();
    throw error;
  }
}

export async function resolveHttpZipSource(
  _input: ResolveHttpZipSourceInput,
): Promise<ResolvedZipPluginSourceRoot> {
  // KayingCode.localrun：仅接受本地 zip 路径，不下载远程 zip。
  throw new Error(
    "Remote plugin zip download is disabled in KayingCode (use a local zip path)",
  );
}

export function readZipPluginSourceSha256(source: unknown): string | undefined {
  if (!isZipPluginUrlSource(source)) return undefined;
  const sha = (source as { sha256?: unknown }).sha256;
  return typeof sha === "string" ? sha : undefined;
}

export function isZipPluginUrlSource(_source: unknown): boolean {
  // KayingCode.localrun：不支持远程 zip URL 源。
  return false;
}

function validateZipSourceInput(input: ResolveZipPluginSourceInput): void {
  if (!ZIP_REQUIRED_SHA256_PATTERN.test(input.sha256.toLowerCase())) {
    throw new Error("Plugin zip source sha256 must be a 64 character hex string");
  }
  if (input.path !== undefined) {
    normalizeZipRelativePath(input.path);
  }
}

async function extractZipArchive(input: {
  archivePath: string;
  signal?: AbortSignal;
  targetRoot: string;
}): Promise<ZipExtractResult> {
  const targetRoot = resolve(input.targetRoot);
  await mkdir(targetRoot, { recursive: true });
  const zipFile = await openZipFile(input.archivePath);
  const topLevelSegments = new Set<string>();
  let entryCount = 0;
  let extractedBytes = 0;

  try {
    await new Promise<void>((resolvePromise, rejectPromise) => {
      const rejectOnce = (error: unknown): void => {
        zipFile.close();
        rejectPromise(error);
      };
      zipFile.once("error", rejectOnce);
      zipFile.once("end", () => {
        zipFile.removeListener("error", rejectOnce);
        resolvePromise();
      });
      zipFile.on("entry", (entry) => {
        void (async () => {
          try {
            throwIfAborted(input.signal);
            entryCount += 1;
            if (entryCount > ZIP_MAX_ENTRIES) {
              throw new Error(`Plugin zip has too many entries: ${entryCount}/${ZIP_MAX_ENTRIES}`);
            }

            const normalizedPath = normalizeZipRelativePath(entry.fileName);
            topLevelSegments.add(normalizedPath.split("/")[0] ?? normalizedPath);
            const targetPath = resolveZipPathWithin(targetRoot, normalizedPath);
            const kind = classifyZipEntry(entry);
            if (kind === "directory") {
              await mkdir(targetPath, { recursive: true });
              zipFile.readEntry();
              return;
            }

            if (entry.uncompressedSize > ZIP_MAX_SINGLE_FILE_BYTES) {
              throw new Error(`Plugin zip entry exceeds single file limit: ${entry.fileName}`);
            }
            const bytes = await readZipEntryBuffer(zipFile, entry, input.signal);
            extractedBytes += bytes.byteLength;
            if (extractedBytes > ZIP_EXTRACT_MAX_BYTES) {
              throw new Error(
                `Plugin zip extracted content exceeds limit: ${extractedBytes}/${ZIP_EXTRACT_MAX_BYTES}`,
              );
            }
            await mkdir(dirname(targetPath), { recursive: true });
            await writeFile(targetPath, bytes);
            zipFile.readEntry();
          } catch (error) {
            rejectOnce(error);
          }
        })();
      });
      zipFile.readEntry();
    });
  } finally {
    zipFile.close();
  }

  return { topLevelSegments };
}

function resolveZipRoot(input: {
  extractRoot: string;
  path?: string;
  requireSingleRoot?: boolean;
  stripRoot?: boolean;
  topLevelSegments: Set<string>;
}): string {
  const extractRoot = resolve(input.extractRoot);
  if (input.requireSingleRoot && input.topLevelSegments.size !== 1) {
    throw new Error(
      `Plugin zip must contain exactly one top-level directory: ${input.topLevelSegments.size}`,
    );
  }
  if (input.path !== undefined) {
    const requested = resolveZipPathWithin(extractRoot, normalizeZipRelativePath(input.path));
    if (!directoryExists(requested)) {
      throw new Error(`Plugin zip source subdirectory does not exist: ${input.path}`);
    }
    return requested;
  }

  if (hasPluginManifest(extractRoot)) {
    return extractRoot;
  }

  if (input.stripRoot !== false && input.topLevelSegments.size === 1) {
    const [segment] = [...input.topLevelSegments];
    if (segment) {
      const candidate = resolveZipPathWithin(extractRoot, segment);
      if (directoryExists(candidate)) return candidate;
    }
  }

  if (!directoryExists(extractRoot)) {
    throw new Error("Plugin zip did not extract a plugin root directory");
  }
  return extractRoot;
}

function hasPluginManifest(rootPath: string): boolean {
  return (
    fileExists(join(rootPath, ".kayingcode-plugin", "plugin.json")) ||
    fileExists(join(rootPath, ".claude-plugin", "plugin.json")) ||
    fileExists(join(rootPath, ".codex-plugin", "plugin.json"))
  );
}

function openZipFile(path: string): Promise<yauzl.ZipFile> {
  return new Promise((resolvePromise, rejectPromise) => {
    yauzl.open(path, { lazyEntries: true, validateEntrySizes: true }, (error, zipFile) => {
      if (error) {
        rejectPromise(error);
        return;
      }
      if (!zipFile) {
        rejectPromise(new Error("Failed to open plugin zip archive"));
        return;
      }
      resolvePromise(zipFile);
    });
  });
}

function readZipEntryBuffer(
  zipFile: yauzl.ZipFile,
  entry: yauzl.Entry,
  signal?: AbortSignal,
): Promise<Buffer> {
  return new Promise((resolvePromise, rejectPromise) => {
    zipFile.openReadStream(entry, (error, stream) => {
      if (error) {
        rejectPromise(error);
        return;
      }
      if (!stream) {
        rejectPromise(new Error(`Failed to read plugin zip entry: ${entry.fileName}`));
        return;
      }

      const chunks: Buffer[] = [];
      let bytesRead = 0;
      const cleanup = (): void => {
        signal?.removeEventListener("abort", onAbort);
      };
      const onAbort = (): void => {
        stream.destroy(new Error("Plugin operation cancelled"));
      };
      signal?.addEventListener("abort", onAbort, { once: true });

      stream.on("data", (chunk: Buffer | string) => {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        bytesRead += buffer.byteLength;
        if (bytesRead > ZIP_MAX_SINGLE_FILE_BYTES) {
          stream.destroy(
            new Error(`Plugin zip entry exceeds single file limit: ${entry.fileName}`),
          );
          return;
        }
        chunks.push(buffer);
      });
      stream.once("error", (streamError) => {
        cleanup();
        rejectPromise(streamError);
      });
      stream.once("end", () => {
        cleanup();
        resolvePromise(Buffer.concat(chunks));
      });
    });
  });
}

function classifyZipEntry(entry: yauzl.Entry): ZipEntryKind {
  const isDirectoryByName = entry.fileName.endsWith("/");
  if ((entry.generalPurposeBitFlag & 0x1) !== 0) {
    throw new Error(`Encrypted plugin zip entries are not supported: ${entry.fileName}`);
  }

  const unixMode = (entry.externalFileAttributes >>> 16) & 0xffff;
  const fileType = unixMode & 0o170000;
  if (fileType === 0o120000) {
    throw new Error(`Plugin zip entry symlinks are not supported: ${entry.fileName}`);
  }
  if (fileType !== 0 && fileType !== 0o100000 && fileType !== 0o040000) {
    throw new Error(`Unsupported plugin zip entry type: ${entry.fileName}`);
  }
  if (fileType === 0o040000 || isDirectoryByName) return "directory";
  return "file";
}

function normalizeZipRelativePath(path: string): string {
  if (path.includes("\0")) {
    throw new Error(`Unsafe plugin zip path: ${path}`);
  }
  const withoutTrailingSlash = path.replace(/\/+$/u, "");
  if (
    !withoutTrailingSlash ||
    path.includes("\\") ||
    isAbsolute(path) ||
    posix.isAbsolute(path) ||
    /^[a-zA-Z]:/u.test(path)
  ) {
    throw new Error(`Unsafe plugin zip path: ${path}`);
  }
  const parts = withoutTrailingSlash.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) {
    throw new Error(`Unsafe plugin zip path: ${path}`);
  }
  return withoutTrailingSlash;
}

function resolveZipPathWithin(rootPath: string, relativePath: string): string {
  const root = resolve(rootPath);
  const target = resolve(root, ...relativePath.split("/"));
  const rel = relative(root, target);
  if (rel === "" || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error(`Unsafe plugin zip path: ${relativePath}`);
  }
  return target;
}

function isLoopbackHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return (
    normalized === "localhost" ||
    normalized === "::1" ||
    normalized === "[::1]" ||
    isIpv4LoopbackHost(normalized)
  );
}

function isIpv4LoopbackHost(hostname: string): boolean {
  const match = /^127(?:\.(\d{1,3})){3}$/u.exec(hostname);
  if (!match) return false;
  return hostname
    .split(".")
    .every((part) => Number.parseInt(part, 10) >= 0 && Number.parseInt(part, 10) <= 255);
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    const error = new Error("Plugin operation cancelled");
    error.name = "AbortError";
    throw error;
  }
}
