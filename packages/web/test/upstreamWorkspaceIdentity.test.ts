import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { stripTypeScriptTypes } from "node:module";
import { promisify } from "node:util";
import { expect, test } from "vitest";
import { buildRemoteAgentWorkspaceIdentity, buildRemoteWorkspaceIdentity } from "@zcode/shared";
import { applyWorkspaceIdentity } from "../scripts/apply-workspace-identity.mjs";

test("the staged upstream Web uses the same workspace keys as its desktop Host", async () => {
  const repoRoot = resolve(import.meta.dirname, "../../..");
  const { commit } = JSON.parse(
    await readFile(resolve(repoRoot, "packages/web/upstream-web.json"), "utf8"),
  );
  const stage = await mkdtemp(resolve(tmpdir(), "upstream-identity-"));
  const relative = "packages/shared/src/remote-workspace-identity.ts";
  const file = resolve(stage, relative);
  try {
    const { stdout } = await promisify(execFile)("git", ["show", `${commit}:${relative}`], {
      cwd: repoRoot,
    });
    await mkdir(dirname(file), { recursive: true });
    // Windows 的 git archive 可能导出 CRLF。
    await writeFile(file, stdout.replaceAll("\n", "\r\n"));
    await applyWorkspaceIdentity({ stage, repoRoot });
    const code = stripTypeScriptTypes(await readFile(file, "utf8"));
    const staged = await import(
      /* @vite-ignore */ `data:text/javascript,${encodeURIComponent(code)}`
    );

    const hostId = "remote-agent:server%3Aone:workspace%25two";
    const path = "/srv/游戏 1:100%";
    const identity = staged.buildRemoteHostWorkspaceIdentity(hostId, path);
    expect(identity).toBe(buildRemoteAgentWorkspaceIdentity("server:one", "workspace%two", path));
    expect(staged.remoteHostIdFromWorkspaceIdentity(identity)).toBe(hostId);
    expect(staged.parseRemoteWorkspaceIdentity(identity)).toEqual({
      kind: "server",
      workspacePath: path,
    });

    const legacyTargets = [
      { kind: "ssh", host: "example.com", username: "game" },
      { kind: "wsl", distro: "Ubuntu", user: "game" },
      { kind: "docker", container: "game" },
      { kind: "server", serverId: "source-one", url: "http://example.com" },
    ] as const;
    for (const target of legacyTargets) {
      const key = buildRemoteWorkspaceIdentity(path, target);
      const legacyHostId = staged.remoteHostIdFromWorkspaceIdentity(key);
      expect(legacyHostId).toBeTruthy();
      expect(staged.buildRemoteHostWorkspaceIdentity(legacyHostId, path)).toBe(key);
    }

    expect(() => staged.buildRemoteHostWorkspaceIdentity("remote-agent:%:invalid", path)).toThrow(
      "Invalid remote host identity",
    );
    await writeFile(file, stdout + "\n// changed upstream\n");
    await expect(applyWorkspaceIdentity({ stage, repoRoot })).rejects.toThrow(
      "Upstream workspace identity changed",
    );
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
});
