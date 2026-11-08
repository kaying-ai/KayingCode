import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { readFile, writeFile, rename, mkdir, realpath, stat, rm, readdir } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { resolve, join, relative, isAbsolute } from "node:path";
import { sessionMetrics } from "./session-updates.mjs";

export async function run(command, args, { timeoutMs = 30000, maxBytes = 8 * 1024 * 1024 } = {}) {
  return new Promise((accept, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    const chunks = [],
      errors = [];
    let bytes = 0,
      failure;
    const timer = setTimeout(() => {
      failure = new Error(`${command}: timed out`);
      child.kill();
    }, timeoutMs);
    child.stdout.on("data", (chunk) => {
      bytes += chunk.length;
      if (bytes > maxBytes) {
        failure = new Error(`${command}: output limit exceeded`);
        child.kill();
      } else chunks.push(chunk);
    });
    child.stderr.on("data", (chunk) => {
      if (errors.reduce((n, b) => n + b.length, 0) < 16000) errors.push(chunk);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (failure) reject(failure);
      else if (code !== 0)
        reject(
          new Error(
            `${command} exited ${code}: ${Buffer.concat(errors).toString().slice(0, 4000)}`,
          ),
        );
      else accept(Buffer.concat(chunks));
    });
  });
}

export async function confined(root, path) {
  const canonicalRoot = await realpath(root);
  const target = await realpath(resolve(root, path));
  const rel = relative(canonicalRoot, target);
  if (
    rel === ".." ||
    rel.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) ||
    isAbsolute(rel)
  )
    throw new Error("Path escapes workspace/session");
  return target;
}

export async function atomicJson(path, value) {
  return atomicText(path, `${JSON.stringify(value, null, 2)}\n`);
}

export async function atomicText(path, value) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, value, { flag: "wx" });
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}

export async function workspace(args) {
  if (!isAbsolute(args.workspacePath)) throw new Error("workspacePath must be absolute");
  const path = await realpath(args.workspacePath);
  const root = join(path, "playtest-results");
  await mkdir(root, { recursive: true });
  await confined(path, root);
  return { path, root, identity: args.workspaceIdentity?.trim() || args.workspacePath };
}

// 工作区互斥锁覆盖读取、设备副作用和提交，避免多个 MCP 进程同时触发相同动作。
export async function locked(root, work) {
  const path = join(root, ".writer-lock");
  try {
    await writeFile(path, String(process.pid), { flag: "wx" });
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    const pid = Number(await readFile(path, "utf8"));
    if (!Number.isInteger(pid) || pid < 1)
      throw new Error("Invalid playtest writer lock; inspect before removing");
    try {
      process.kill(pid, 0);
    } catch (probe) {
      if (probe.code !== "ESRCH") throw probe;
      // 自动抢删崩溃锁会与其他恢复进程竞争，可能删掉新 owner 的锁；保留现场后显式恢复。
      throw new Error(
        `Stale writer lock: verify PID ${pid} exited, then remove ${path} and resume`,
      );
    }
    throw new Error("Playtest workspace busy in another process");
  }
  try {
    return await work();
  } finally {
    await rm(path, { force: true });
  }
}

export async function loadSession(ws, id) {
  if (!/^session-[0-9a-f-]{36}$/.test(id)) throw new Error("Invalid sessionId");
  const directory = await confined(ws.root, join(ws.root, id));
  const sessionPath = await confined(directory, join(directory, "session.json"));
  const session = JSON.parse(await readFile(sessionPath, "utf8"));
  if (session.workspaceIdentity !== ws.identity) throw new Error("Workspace identity mismatch");
  if (session.id !== id || session.schemaVersion !== 1) throw new Error("Invalid session data");
  for (const folder of ["screenshots", "recordings", "highlights", "logs"])
    await confined(directory, join(directory, folder));
  return { session, directory };
}

export async function assertDeviceFree(ws, serial, except) {
  for (const name of await readdir(ws.root)) {
    if (name === except || !name.startsWith("session-")) continue;
    const directory = await confined(ws.root, join(ws.root, name));
    const path = join(directory, "session.json");
    let other;
    try {
      other = JSON.parse(await readFile(await confined(directory, path), "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") continue;
      throw error;
    }
    if (other.status === "running" && other.device?.serial === serial)
      throw new Error(`Device busy: ${serial} (${other.id}); pause/stop it first`);
  }
}

export async function apkInfo(path) {
  const info = await stat(path);
  if (
    !info.isFile() ||
    info.size < 4 ||
    info.size > 1024 ** 3 ||
    !path.toLowerCase().endsWith(".apk")
  )
    throw new Error("Expected local APK file, 4 bytes–1 GiB");
  const hash = createHash("sha256");
  let first = true;
  for await (const chunk of createReadStream(path)) {
    if (first && !chunk.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 3, 4])))
      throw new Error("APK ZIP signature missing");
    first = false;
    hash.update(chunk);
  }
  return {
    path: await realpath(path),
    bytes: info.size,
    sha256: hash.digest("hex"),
    inspection: "ZIP signature and hash only; not a malware or permissions scan",
  };
}

export function pngDimensions(bytes) {
  if (
    bytes.length < 24 ||
    !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    throw new Error("Invalid PNG screenshot");
  const width = bytes.readUInt32BE(16),
    height = bytes.readUInt32BE(20);
  if (!width || !height || width > 20000 || height > 20000)
    throw new Error("Invalid screenshot dimensions");
  return { width, height };
}

export async function projections(directory, session) {
  const metrics = {
    ...sessionMetrics(session, Date.parse(session.updatedAt)),
    actionCount: session.actions.length,
    events: session.events.length,
    artifacts: session.artifacts.length,
    wallElapsedSeconds:
      (Date.parse(session.endedAt ?? session.updatedAt) - Date.parse(session.createdAt)) / 1000,
  };
  await atomicJson(join(directory, "manifest.json"), {
    schemaVersion: 1,
    sessionId: session.id,
    artifacts: session.artifacts,
  });
  await atomicJson(join(directory, "metrics.json"), metrics);
  for (const [name, items] of [
    ["actions", session.actions],
    ["events", session.events],
  ])
    await atomicText(
      join(directory, `${name}.jsonl`),
      items.map((item) => JSON.stringify(item)).join("\n") + (items.length ? "\n" : ""),
    );
}
