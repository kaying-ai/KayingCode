import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "vitest";
import {
  MANAGED_WORKTREE_HOME_SEGMENTS,
  isManagedWorktreeBucket,
  isPathInside,
  isSamePath,
  mapProjectRootsIntoWorktree,
  parseManagedWorktreePath,
  resolveManagedWorktreeRoot,
  resolveManagedWorktreeSourcePath,
  resolveWorkspaceHookTrustIdentity,
  type WorkspaceHookTrustIdentityFs,
} from "../src/managed-worktree/index.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function tempRoot(): Promise<string> {
  // macOS 临时目录本身是软链；resolver 按 realpath 判定，fixture 统一用 realpath。
  const root = await realpath(await mkdtemp(join(tmpdir(), "kayingcode-managed-worktree-")));
  roots.push(root);
  return root;
}

const nodeFs: WorkspaceHookTrustIdentityFs = {
  readFile: async (path) => await readFile(path, "utf8"),
  realpath: async (path) => await realpath(path),
  stat: async (path) => {
    const info = await stat(path).catch(() => null);
    return info ? { isFile: info.isFile(), isDirectory: info.isDirectory() } : null;
  },
};

describe("managed worktree layout", () => {
  it("uses the kayingcode data root instead of the upstream .zcode directory", () => {
    assert.deepEqual([...MANAGED_WORKTREE_HOME_SEGMENTS], [".kayingcode", "worktrees"]);
    assert.equal(resolveManagedWorktreeRoot("/data"), join("/data", ".kayingcode", "worktrees"));
  });

  it("accepts only 4-char lowercase hex buckets", () => {
    assert.equal(isManagedWorktreeBucket("3f2a"), true);
    assert.equal(isManagedWorktreeBucket("3F2A"), false);
    assert.equal(isManagedWorktreeBucket("abc"), false);
    assert.equal(isManagedWorktreeBucket("3f2ab"), false);
  });

  it("parses <root>/<bucket>/<name> and nested relative paths", () => {
    const managedRoot = join("/data", ".kayingcode", "worktrees");
    const parts = parseManagedWorktreePath(managedRoot, join(managedRoot, "3f2a", "repo", "src"));
    assert.ok(parts);
    assert.equal(parts.bucket, "3f2a");
    assert.equal(parts.name, "repo");
    assert.equal(parts.worktreeRoot, join(managedRoot, "3f2a", "repo"));
    assert.equal(parts.relativePath, "src");
  });

  it("rejects the managed root itself and layouts without a valid bucket", () => {
    const managedRoot = join("/data", ".kayingcode", "worktrees");
    assert.equal(parseManagedWorktreePath(managedRoot, managedRoot), null);
    assert.equal(parseManagedWorktreePath(managedRoot, join(managedRoot, "repo")), null);
    assert.equal(parseManagedWorktreePath(managedRoot, join(managedRoot, "xyz1", "repo")), null);
  });

  it("compares paths without being fooled by sibling prefixes", () => {
    assert.equal(isPathInside("/a/b", "/a/b/c"), true);
    assert.equal(isPathInside("/a/b", "/a/b"), true);
    assert.equal(isPathInside("/a/b", "/a/bc"), false);
    assert.equal(isSamePath("/a/b", "/a/b/"), true);
  });

  it("maps project roots into the worktree and drops the source checkout", () => {
    const mapped = mapProjectRootsIntoWorktree(
      ["/repo", "/repo/packages/app", "/elsewhere", "/repo"],
      { sourceRoot: "/repo", worktreeRoot: "/wt", cwd: "/wt" },
    );
    assert.deepEqual(mapped.sort(), ["/elsewhere", "/wt/packages/app"]);
  });
});

/**
 * 构造一个真实目录布局的受管 worktree：源仓库 `.git` 目录、admin 目录（gitdir 反向链接 + commondir）
 * 与 worktree 中的 `.git` 指针文件。resolver 不调用 git 二进制，只按这些文件判定。
 */ async function fixture() {
  const root = await tempRoot();
  const source = join(root, "projects", "repo");
  const dataBaseDir = join(root, "data");
  const worktree = join(dataBaseDir, ".kayingcode", "worktrees", "3f2a", "repo");
  const admin = join(source, ".git", "worktrees", "repo");
  await mkdir(join(source, ".git"), { recursive: true });
  await mkdir(join(source, "src", "pkg"), { recursive: true });
  await mkdir(join(worktree, "src", "pkg"), { recursive: true });
  await mkdir(admin, { recursive: true });
  await writeFile(join(worktree, ".git"), `gitdir: ${admin}\n`);
  await writeFile(join(admin, "gitdir"), `${join(worktree, ".git")}\n`);
  await writeFile(join(admin, "commondir"), "../..\n");
  return { root, source, dataBaseDir, worktree, admin };
}

describe("resolveWorkspaceHookTrustIdentity", () => {
  it("maps a verified managed worktree back to the source repository", async () => {
    const f = await fixture();
    assert.equal(
      await resolveWorkspaceHookTrustIdentity(
        { workspacePath: f.worktree, dataBaseDir: f.dataBaseDir },
        nodeFs,
      ),
      f.source,
    );
  });

  it("maps nested paths into the corresponding source path", async () => {
    const f = await fixture();
    assert.equal(
      await resolveManagedWorktreeSourcePath(join(f.worktree, "src", "pkg"), f.dataBaseDir, nodeFs),
      join(f.source, "src", "pkg"),
    );
  });

  it("fails closed when the gitdir reverse link points elsewhere", async () => {
    const f = await fixture();
    await writeFile(join(f.admin, "gitdir"), `${join(f.root, "elsewhere", ".git")}\n`);
    assert.equal(
      await resolveWorkspaceHookTrustIdentity(
        { workspacePath: f.worktree, dataBaseDir: f.dataBaseDir },
        nodeFs,
      ),
      f.worktree,
    );
  });

  it("fails closed for plain (non-managed) directories", async () => {
    const root = await tempRoot();
    const workspace = join(root, "plain");
    await mkdir(workspace, { recursive: true });
    assert.equal(
      await resolveWorkspaceHookTrustIdentity(
        { workspacePath: workspace, dataBaseDir: join(root, "data") },
        nodeFs,
      ),
      workspace,
    );
  });

  it("keeps remote identities scoped to their host instead of the local path", async () => {
    const f = await fixture();
    const identity = `remote:ssh:example.test:22:coder:${f.worktree}`;
    assert.equal(
      await resolveWorkspaceHookTrustIdentity(
        { workspacePath: f.worktree, workspaceIdentity: identity, dataBaseDir: f.dataBaseDir },
        nodeFs,
      ),
      identity,
    );
  });

  it("fail-closes on filesystem errors instead of inheriting trust", async () => {
    const throwingFs: WorkspaceHookTrustIdentityFs = {
      readFile: async () => {
        throw new Error("io");
      },
      realpath: async () => {
        throw new Error("io");
      },
      stat: async () => null,
    };
    assert.equal(
      await resolveWorkspaceHookTrustIdentity(
        { workspacePath: "/workspace/repo", dataBaseDir: "/data" },
        throwingFs,
      ),
      "/workspace/repo",
    );
  });
});
