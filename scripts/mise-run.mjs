import { spawn } from "node:child_process";

import { withPinnedNodePath } from "./mise-toolchain-env.mjs";

const [requestedCommand, ...args] = process.argv.slice(2);
if (!requestedCommand) {
  console.error("Usage: node scripts/mise-run.mjs <command> [...args]");
  process.exit(1);
}

// 包管理器为 pnpm。
const child = spawn(requestedCommand, args, {
  cwd: process.cwd(),
  env: withPinnedNodePath(process.env, process.execPath),
  shell: false,
  stdio: "inherit",
});

child.on("error", (error) => {
  console.error(`[mise-run] failed to start ${requestedCommand}: ${error.message}`);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
