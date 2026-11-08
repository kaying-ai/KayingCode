import assert from "node:assert/strict";
import test from "node:test";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, realpath, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import {
  resolveDesktopProductIdentity,
  resolveDesktopDevelopmentAppId,
  resolveWindowsAppUserModelIdForFlavor,
} from "./desktop-product-identity.mjs";

test("production package uses the new KayingCode app id", () => {
  assert.deepEqual(
    resolveDesktopProductIdentity({
      KAYINGCODE_ENV: "production",
    }),
    {
      flavor: "production",
      appId: "com.lingdian.kayingai.agent.code",
      productName: "KayingCode",
      linuxExecutableName: "kayingcode",
      linuxPackageName: "kayingcode",
      cuaHelperInstallVariant: null,
    },
  );
});

test("preview package derives an isolated id while preserving its display name", () => {
  assert.deepEqual(
    resolveDesktopProductIdentity({
      KAYINGCODE_ENV: "production",
      KAYINGCODE_PREVIEW_IDENTITY: "1",
    }),
    {
      flavor: "preview",
      appId: "com.lingdian.kayingai.agent.code.preview",
      productName: "KayingCode Preview",
      linuxExecutableName: "kayingcode-preview",
      linuxPackageName: "kayingcode-preview",
      cuaHelperInstallVariant: "preview",
    },
  );
});

test("packaged Windows AUMIDs reuse the same production and preview app ids", () => {
  assert.equal(
    resolveWindowsAppUserModelIdForFlavor("production"),
    "com.lingdian.kayingai.agent.code",
  );
  assert.equal(
    resolveWindowsAppUserModelIdForFlavor("preview"),
    "com.lingdian.kayingai.agent.code.preview",
  );
});

test("development runtime returns null so the process skips setAppUserModelId", () => {
  // 修复依据：Win11 任务栏对自定义 AUMID 只按开始菜单匹配的快捷方式解析图标；
  // 开发态没有受管快捷方式，设置 AUMID 会让重品牌 exe 图标与窗口 HICON 都不生效。
  assert.equal(resolveWindowsAppUserModelIdForFlavor("production", { isPackaged: false }), null);
  assert.equal(resolveWindowsAppUserModelIdForFlavor("preview", { isPackaged: false }), null);
  assert.equal(
    resolveWindowsAppUserModelIdForFlavor("production", { isPackaged: true }),
    "com.lingdian.kayingai.agent.code",
  );
});

test("macOS development identity isolates clones and is stable across worktrees and paths", async () => {
  const root = await mkdtemp(join(tmpdir(), "kaying-dev-id-"));
  const git = promisify(execFile);
  try {
    const repository = join(root, "repo with spaces");
    const worktree = join(root, "worktree");
    const clone = join(root, "clone");
    await git("git", ["init", "--quiet", repository]);
    await git("git", [
      "-C",
      repository,
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@example.invalid",
      "commit",
      "--allow-empty",
      "--quiet",
      "-m",
      "fixture",
    ]);
    await git("git", ["-C", repository, "worktree", "add", "--quiet", "--detach", worktree]);
    await git("git", ["clone", "--quiet", repository, clone]);
    const nested = join(repository, "nested");
    await mkdir(nested);
    const identity = await resolveDesktopDevelopmentAppId(repository);
    assert.match(identity, /^dev\.kayingcode\.app\.development\.r[a-f0-9]{16}$/);
    assert.equal(identity, await resolveDesktopDevelopmentAppId(repository));
    assert.equal(identity, await resolveDesktopDevelopmentAppId(nested));
    assert.equal(identity, await resolveDesktopDevelopmentAppId(worktree));
    assert.notEqual(identity, await resolveDesktopDevelopmentAppId(clone));
    if (process.platform !== "win32") {
      const alias = join(root, "alias");
      await symlink(await realpath(repository), alias, "dir");
      assert.equal(identity, await resolveDesktopDevelopmentAppId(alias));
    }
    await assert.rejects(resolveDesktopDevelopmentAppId(root));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
