/**
 * Production Maker Git remote gate.
 *
 * 修复依据：新建工程曾误绑 rnd 内网 Git（fuping.agnt.xd.com），公网 TLS 握手失败。
 * push 前必须确认 origin 在 production Maker 主机上，避免把不可用远端当成网络故障排查。
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { KayingForTaptapOperationLogger } from "../operations/logging";

const execFileAsync = promisify(execFile);

/** Production Maker Git host. rnd uses an internal R&D host that is unreachable over public TLS. */
export const PRODUCTION_MAKER_GIT_HOST = "maker.taptap.cn";

export async function assertProductionMakerGitRemote(
  projectRoot: string,
  logger?: KayingForTaptapOperationLogger,
): Promise<void> {
  const remote = await readGitValue(projectRoot, ["remote", "get-url", "origin"]);
  if (!remote) {
    throw new Error(
      [
        "TapTap submission blocked: project has no Git origin remote.",
        "classification: missing_git_remote",
        "Re-run kaying-for-taptap project create/ensure so Maker can bind a production remote.",
      ].join("\n"),
    );
  }
  let host = "";
  try {
    host = new URL(remote.replace(/^git@([^:]+):/, "https://$1/")).hostname.toLowerCase();
  } catch {
    host = "";
  }
  if (host === PRODUCTION_MAKER_GIT_HOST) return;
  logger?.warn("git_preflight", "Non-production Maker Git remote detected", {
    projectRoot,
    remoteHost: host || remote,
  });
  throw new Error(
    [
      "TapTap submission blocked: Git origin is not the production Maker remote.",
      `remote_host: ${host || remote}`,
      `expected_host: ${PRODUCTION_MAKER_GIT_HOST}`,
      "classification: wrong_maker_environment",
      "The project was likely created against the internal rnd environment (fuping.agnt.xd.com).",
      "Recreate or rebind the project with kaying-for-taptap project create/ensure on production, then retry.",
    ].join("\n"),
  );
}

async function readGitValue(projectRoot: string, args: string[]): Promise<string> {
  try {
    const result = await execFileAsync("git", ["-C", projectRoot, ...args]);
    return result.stdout.trim();
  } catch {
    return "";
  }
}
