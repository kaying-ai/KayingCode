import { execFile } from "node:child_process";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { setDataBaseDir } from "../src/paths.js";
import { createHooksService } from "../src/hooks/hooksService.js";

/**
 * Host Settings 的 Hook Trust identity（D23）必须与 CLI 同一 resolver：
 * 受管 worktree 读取源仓库记录的 Trust record，脚本入口不存在时展示为 blocked_untrusted（D24）。
 */

const execFileAsync = promisify(execFile);
const roots: string[] = [];
const BUCKET = "3f2a";
const REPO = "repo";

async function git(cwd: string, ...args: string[]): Promise<void> {
  await execFileAsync(
    "git",
    ["-c", "user.name=KayingCode Test", "-c", "user.email=test@example.com", ...args],
    { cwd },
  );
}

async function makeRoot(): Promise<string> {
  const root = await realpath(await mkdtemp(join(tmpdir(), "kayingcode-hooks-trust-")));
  roots.push(root);
  return root;
}

async function fixture() {
  const root = await makeRoot();
  const source = join(root, "projects", REPO);
  // services 的用户配置与受管 worktree 都相对 getDataBaseDir() 解析；这里让两者同根。
  const dataBaseDir = root;
  const storageRoot = join(root, "user-data");
  const worktree = join(dataBaseDir, ".kayingcode", "worktrees", BUCKET, REPO);
  await mkdir(join(root, ".kayingcode", "cli"), { recursive: true });
  await writeFile(
    join(root, ".kayingcode", "cli", "config.json"),
    JSON.stringify({ storage: { dir: storageRoot }, hooks: { enabled: true, events: {} } }),
  );
  await mkdir(join(source, ".kayingcode"), { recursive: true });
  await writeFile(
    join(source, ".kayingcode", "config.json"),
    JSON.stringify({
      hooks: {
        enabled: true,
        events: {
          SessionStart: [{ hooks: [{ type: "process", command: "sh", args: ["start.sh"] }] }],
        },
      },
    }),
  );
  await writeFile(join(source, "start.sh"), "echo start\n");
  await git(source, "init", "-q");
  await git(source, "add", ".");
  await git(source, "commit", "-q", "-m", "init");
  await mkdir(join(dataBaseDir, ".kayingcode", "worktrees", BUCKET), { recursive: true });
  await git(source, "worktree", "add", "-q", "--detach", worktree);
  setDataBaseDir(dataBaseDir);
  return { dataBaseDir, root, source, storageRoot, worktree };
}

afterEach(async () => {
  setDataBaseDir(null);
  await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("hooks service workspace trust identity", () => {
  it("worktree 读取源仓库 Trust record，Settings 展示 trusted_persistent", async () => {
    const value = await fixture();
    const service = createHooksService();
    const before = await service.loadHooks({ workspacePath: value.worktree });
    const projectHook = before.hooks.find((hook) => hook.workspaceHook);
    expect(projectHook?.workspaceHook?.trustState).toBe("pending_trust");

    const record = projectHook!.workspaceHook!;
    await mkdir(join(value.storageRoot, "security"), { recursive: true });
    await writeFile(
      join(value.storageRoot, "security", "workspace-hook-trust-v1.json"),
      JSON.stringify({
        schemaVersion: 1,
        records: [
          {
            workspaceIdentity: value.source,
            hookDeclarationDigest: record.hookDeclarationDigest,
            digestAlgorithm: "sha256",
            decision: "trusted",
            grantedAt: "2026-11-20T00:00:00.000Z",
            bundleDigestAtGrant: record.bundleDigest,
            eventAtGrant: "SessionStart",
            displayCommandAtGrant: "sh start.sh",
            sourcePathAtGrant: ".kayingcode/config.json",
            sourceDiscoveryOrderAtGrant: 0,
            matcherAtGrant: null,
            matcherIndexAtGrant: 0,
            hookIndexAtGrant: 0,
          },
        ],
      }),
    );

    const after = await service.loadHooks({ workspacePath: value.worktree });
    expect(after.hooks.find((hook) => hook.workspaceHook)?.workspaceHook?.trustState).toBe(
      "trusted_persistent",
    );
  });

  it("入口脚本不存在时展示 blocked_untrusted，即使 digest 已有 Trust record", async () => {
    const value = await fixture();
    const service = createHooksService();
    const before = await service.loadHooks({ workspacePath: value.worktree });
    const record = before.hooks.find((hook) => hook.workspaceHook)!.workspaceHook!;
    await mkdir(join(value.storageRoot, "security"), { recursive: true });
    await writeFile(
      join(value.storageRoot, "security", "workspace-hook-trust-v1.json"),
      JSON.stringify({
        schemaVersion: 1,
        records: [
          {
            workspaceIdentity: value.source,
            hookDeclarationDigest: record.hookDeclarationDigest,
            digestAlgorithm: "sha256",
            decision: "trusted",
            grantedAt: "2026-11-20T00:00:00.000Z",
            eventAtGrant: "SessionStart",
            displayCommandAtGrant: "sh start.sh",
            sourcePathAtGrant: ".kayingcode/config.json",
          },
        ],
      }),
    );
    // 删除入口脚本：digest 变化且状态为 missing，安装记录不能让它显示为可信任。
    await rm(join(value.source, "start.sh"));
    await rm(join(value.worktree, "start.sh"));

    const after = await service.loadHooks({ workspacePath: value.worktree });
    const state = after.hooks.find((hook) => hook.workspaceHook)?.workspaceHook;
    expect(state?.trustState).toBe("blocked_untrusted");
  });
});
