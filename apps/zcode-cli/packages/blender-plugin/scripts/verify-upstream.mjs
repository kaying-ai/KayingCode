import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join, posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pluginRoot } from "./runtime.mjs";

export const snapshotPaths = [
  "LICENSE",
  "README.md",
  "pyproject.toml",
  "uv.lock",
  "addon.py",
  "src",
];

export async function inventory(root, prefix = "") {
  const entries = await readdir(join(root, prefix), { withFileTypes: true });
  const files = {};
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name === "__pycache__" || entry.name.endsWith(".pyc")) continue;
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) Object.assign(files, await inventory(root, path));
    else if (entry.isFile())
      files[path] = createHash("sha256")
        .update(await readFile(join(root, path)))
        .digest("hex");
    else throw new Error(`Unsupported snapshot entry: ${path}`);
  }
  return files;
}

export async function inspectSnapshot(root) {
  const project = await readFile(join(root, "pyproject.toml"), "utf8");
  const version = project.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
  if (!/^name\s*=\s*"mcp-for-blender"/m.test(project) || !version)
    throw new Error("Unexpected upstream project");
  const addon = await readFile(join(root, "addon.py"));
  const bundled = await readFile(join(root, "src/blender_mcp/bundled/addon.py"));
  if (!addon.equals(bundled)) throw new Error("Bundled addon differs from addon.py");
  const protocol = Number(addon.toString().match(/^ADDON_PROTOCOL_VERSION\s*=\s*(\d+)/m)?.[1]);
  const manager = await readFile(join(root, "src/blender_mcp/addon_manager.py"), "utf8");
  if (
    !protocol ||
    Number(manager.match(/^EXPECTED_ADDON_PROTOCOL_VERSION\s*=\s*(\d+)/m)?.[1]) !== protocol
  ) {
    throw new Error("Addon/server protocol mismatch");
  }
  const uvLock = await readFile(join(root, "uv.lock"), "utf8");
  if (!uvLock.includes(`name = "mcp-for-blender"\nversion = "${version}"`))
    throw new Error("uv.lock project version mismatch");
  const license = await readFile(join(root, "LICENSE"), "utf8");
  if (!license.includes("MIT License") || !license.includes("Copyright"))
    throw new Error("Upstream MIT license missing");
  await accessRuntime(root);
  return { version, addonProtocol: protocol, files: await inventory(root) };
}

async function accessRuntime(root) {
  await readFile(join(root, "src/blender_mcp/server.py"));
}

async function crlfOnly(root, path, expectedHash) {
  try {
    const raw = await readFile(join(root, path));
    if (!raw.includes(Buffer.from("\r\n"))) return false;
    // 用 latin1 逐字节往返，避免把二进制内容误当 UTF-8 解码。
    const normalized = Buffer.from(raw.toString("latin1").replace(/\r\n/g, "\n"), "latin1");
    return createHash("sha256").update(normalized).digest("hex") === expectedHash;
  } catch {
    return false;
  }
}

async function throwSnapshotMismatch(snapshotRoot, actual, lock, changed, missing, unexpected) {
  const crlf = (
    await Promise.all(changed.map((path) => crlfOnly(snapshotRoot, path, lock.files[path])))
  ).reduce((paths, isCrlf, index) => (isCrlf ? [...paths, changed[index]] : paths), []);
  const crlfSet = new Set(crlf);
  const other = changed.filter((path) => !crlfSet.has(path));
  const limit = 8;
  const listed = [...crlf, ...other, ...missing, ...unexpected];
  const detail = listed.length
    ? `\n${listed.slice(0, limit).join("\n")}${listed.length > limit ? `\n… and ${listed.length - limit} more` : ""}`
    : "";
  const reason =
    crlf.length && !other.length && !missing.length && !unexpected.length
      ? "Files differ only by CRLF line endings, usually a stale Windows checkout left by an earlier branch switch; delete the listed vendor files and re-checkout them, or re-clone the repository."
      : "Restore the builtin plugin or re-run sync-upstream for this commit.";
  throw new Error(
    `Upstream snapshot mismatch: expected ${lock.version} / protocol ${lock.addonProtocol}, found ${actual.version} / protocol ${actual.addonProtocol}; ` +
      `changed=${changed.length} (crlf-only=${crlf.length}), missing=${missing.length}, unexpected=${unexpected.length}. ` +
      `${reason}${detail}`,
  );
}

export async function verifyUpstream(root = pluginRoot) {
  const lock = JSON.parse(await readFile(join(root, "upstream-lock.json"), "utf8"));
  if (lock.schemaVersion !== 1 || !/^[a-f0-9]{40}$/.test(lock.commit))
    throw new Error("Invalid upstream lock");
  for (const path of Object.keys(lock.files || {})) {
    if (posix.isAbsolute(path) || path.includes("\\") || path.split("/").includes(".."))
      throw new Error("Invalid inventory path");
  }
  const snapshotRoot = join(root, "vendor/mcp-for-blender");
  const actual = await inspectSnapshot(snapshotRoot);
  const lockedFiles = lock.files || {};
  const changed = Object.keys(lockedFiles).filter(
    (path) => path in actual.files && lockedFiles[path] !== actual.files[path],
  );
  const missing = Object.keys(lockedFiles).filter((path) => !(path in actual.files));
  const unexpected = Object.keys(actual.files).filter((path) => !(path in lockedFiles));
  if (
    actual.version !== lock.version ||
    actual.addonProtocol !== lock.addonProtocol ||
    changed.length ||
    missing.length ||
    unexpected.length
  )
    await throwSnapshotMismatch(snapshotRoot, actual, lock, changed, missing, unexpected);
  return lock;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const lock = await verifyUpstream();
  process.stdout.write(`Blender upstream ${lock.version} (${lock.commit}) verified\n`);
}
