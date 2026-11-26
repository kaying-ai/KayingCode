import { execFile } from "node:child_process";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import {
  createConfig,
  createConfigWithPluginMigrations,
  resolveKayingCodeDataBaseDir,
  resolveWorkspaceHookTrustIdentityForWorkspace,
} from "../src/config/index.js";
import { buildRemoteWorkspaceIdentity } from "@zcode/shared";

/**
 * Hook Trust identity（D23）与入口脚本内容绑定（D24）在 config 装配入口的行为。
 * 产品没有需要异步写回的插件迁移（visualize 官方插件 defaultEnabled=false），
 * createConfigWithPluginMigrations 保留为“异步读入口脚本状态”的装配入口。
 */

const execFileAsync = promisify(execFile);
const roots: string[] = [];

async function makeRoot(prefix: string): Promise<string> {
  const root = await realpath(await mkdtemp(join(tmpdir(), prefix)));
  roots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function git(cwd: string, ...args: string[]): Promise<void> {
  await execFileAsync(
    "git",
    ["-c", "user.name=KayingCode Test", "-c", "user.email=test@example.com", ...args],
    { cwd },
  );
}

async function writeProjectHook(workspace: string): Promise<void> {
  await mkdir(join(workspace, ".git"), { recursive: true });
  await mkdir(join(workspace, ".kayingcode"), { recursive: true });
  await writeFile(
    join(workspace, ".kayingcode", "config.json"),
    JSON.stringify({
      hooks: {
        enabled: true,
        events: {
          SessionStart: [{ hooks: [{ type: "process", command: "node", args: ["hook.mjs"] }] }],
        },
      },
    }),
  );
  await writeFile(join(workspace, "hook.mjs"), "console.log('hook')\n");
}

describe("createConfigWithPluginMigrations", () => {
  it("异步读取入口脚本状态，并使用调用方预解析的 Trust identity", async () => {
    const home = await makeRoot("kayingcode-config-hook-");
    const workspace = join(home, "workspace");
    await mkdir(workspace, { recursive: true });
    await writeProjectHook(workspace);

    const result = await createConfigWithPluginMigrations({
      env: {},
      userConfigPath: join(home, ".kayingcode", "cli", "config.json"),
      workingDirectory: workspace,
      workspaceHookTrustIdentity: "/projects/source-repo",
    });
    const snapshot = result.sources.project.workspaceHookSnapshot!;
    expect(snapshot.workspaceIdentity).toBe("/projects/source-repo");
    expect(snapshot.hooks[0]?.scriptEntry?.state.kind).toBe("file");

    // 同步入口不读文件：同一声明记为 unverifiable，不能静默退回“没有入口”的旧 digest。
    const sync = createConfig({
      env: {},
      userConfigPath: join(home, ".kayingcode", "cli", "config.json"),
      workingDirectory: workspace,
    });
    expect(sync.sources.project.workspaceHookSnapshot?.hooks[0]?.scriptEntry?.state).toEqual({
      kind: "unverifiable",
    });
  });

  it("未预先解析时保留远程 identity 的 host 命名空间", async () => {
    const home = await makeRoot("kayingcode-config-remote-");
    const workspace = join(home, "workspace");
    await mkdir(workspace, { recursive: true });
    await writeProjectHook(workspace);
    const identity = buildRemoteWorkspaceIdentity(workspace, {
      kind: "ssh",
      host: "example.test",
      port: 22,
      username: "coder",
    });

    const result = createConfig({
      env: {},
      userConfigPath: join(home, ".kayingcode", "cli", "config.json"),
      workingDirectory: workspace,
      workspaceIdentity: identity,
    });
    expect(result.sources.project.workspaceHookSnapshot?.workspaceIdentity).toBe(identity);
  });
});

describe("resolveWorkspaceHookTrustIdentityForWorkspace", () => {
  it("普通本地 workspace 返回自身路径", async () => {
    const workspace = await makeRoot("kayingcode-trust-plain-");
    await expect(
      resolveWorkspaceHookTrustIdentityForWorkspace({ workspacePath: workspace, env: {} }),
    ).resolves.toBe(workspace);
  });

  it("受管 worktree 归一为源仓库对应路径；非法 gitdir 时退回自身", async () => {
    const root = await makeRoot("kayingcode-trust-worktree-");
    const source = join(root, "projects", "repo");
    const dataBaseDir = join(root, "data");
    const worktree = join(dataBaseDir, ".kayingcode", "worktrees", "3f2a", "repo");
    await mkdir(source, { recursive: true });
    await writeFile(join(source, "README.md"), "hello\n");
    await git(source, "init", "-q");
    await git(source, "add", ".");
    await git(source, "commit", "-q", "-m", "init");
    await mkdir(join(dataBaseDir, ".kayingcode", "worktrees", "3f2a"), { recursive: true });
    await git(source, "worktree", "add", "-q", "--detach", worktree);

    const env = { KAYINGCODE_DATA_BASE_DIR: dataBaseDir };
    expect(resolveKayingCodeDataBaseDir(env)).toBe(dataBaseDir);
    await expect(
      resolveWorkspaceHookTrustIdentityForWorkspace({ workspacePath: worktree, env }),
    ).resolves.toBe(source);

    // 反向链接被篡改后无法证明归属，不得继承源仓库授权。
    await writeFile(
      join(source, ".git", "worktrees", "repo", "gitdir"),
      `${join(root, "elsewhere", ".git")}\n`,
    );
    await expect(
      resolveWorkspaceHookTrustIdentityForWorkspace({ workspacePath: worktree, env }),
    ).resolves.toBe(worktree);
  });

  it("远程 identity 原样保留，不落到本地裸路径", async () => {
    const workspace = await makeRoot("kayingcode-trust-remote-");
    const identity = buildRemoteWorkspaceIdentity(workspace, {
      kind: "server",
      serverId: "example-server",
      url: "https://example.com",
    });
    await expect(
      resolveWorkspaceHookTrustIdentityForWorkspace({
        workspacePath: workspace,
        workspaceIdentity: identity,
        env: {},
      }),
    ).resolves.toBe(identity);
  });
});
