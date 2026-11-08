import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { execFile } from "node:child_process";

async function freePort() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Could not allocate test port");
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return address.port;
}

const port = await freePort();
const origin = `http://127.0.0.1:${port}`;
const dataDir = await mkdtemp(join(tmpdir(), "kayingcode-relay-cloudflare-test-"));
const wrangler = spawn(
  process.execPath,
  [
    fileURLToPath(new URL("../../../node_modules/wrangler/bin/wrangler.js", import.meta.url)),
    "dev",
    "--ip",
    "127.0.0.1",
    "--port",
    String(port),
    "--persist-to",
    dataDir,
  ],
  { stdio: ["ignore", "pipe", "pipe"] },
);
// Windows 无法直接 spawn pnpm shim；用真实 Node 入口，失败也进入统一清理路径。
let spawnError;
wrangler.on("error", (error) => {
  spawnError = error;
});
let logs = "";
for (const stream of [wrangler.stdout, wrangler.stderr])
  stream.on("data", (chunk) => {
    logs = (logs + String(chunk)).slice(-8_000);
  });

try {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (spawnError) throw spawnError;
    if (wrangler.exitCode !== null) throw new Error(`Wrangler exited early: ${logs}`);
    try {
      if ((await fetch(`${origin}/healthz`)).ok) break;
    } catch {
      /* Not listening yet. */
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (Date.now() >= deadline) throw new Error(`Wrangler did not become ready: ${logs}`);
  const tests = spawn(
    process.execPath,
    ["--import", "tsx", "--test", "--test-concurrency=1", "src/**/*.test.ts"],
    {
      stdio: "inherit",
      env: { ...process.env, REMOTE_V2_TEST_ORIGIN: origin },
    },
  );
  const code = await new Promise((resolve, reject) => {
    tests.on("error", reject);
    tests.on("exit", resolve);
  });
  if (code !== 0) process.exitCode = code || 1;
} finally {
  if (wrangler.pid && wrangler.exitCode === null) {
    const exited = new Promise((resolve) => wrangler.once("exit", resolve));
    // Windows kill 不会通知 Wrangler 回收 workerd；仅结束当前测试拥有的子树。
    if (process.platform === "win32") {
      await promisify(execFile)("taskkill", ["/PID", String(wrangler.pid), "/T", "/F"]);
    } else {
      wrangler.kill("SIGTERM");
    }
    await exited;
  }
  // taskkill 返回时 Windows 可能仍在释放 SQLite 文件句柄，使用 fs 自带的有界清理重试。
  await rm(dataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}
