import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { setDataBaseDir } from "../src/paths.js";
import { createHooksService } from "../src/hooks/hooksService.js";

const USER_HOOK = {
  enabled: true,
  events: {
    SessionStart: [{ hooks: [{ type: "command", command: "echo user" }] }],
  },
};

const PROJECT_HOOK = {
  enabled: true,
  events: {
    PreToolUse: [{ hooks: [{ type: "command", command: "echo project" }] }],
  },
};

async function createFixture() {
  const root = await mkdtemp(join(tmpdir(), "kayingcode-hooks-scope-"));
  const workspacePath = join(root, "workspace");
  await mkdir(join(root, ".kayingcode", "cli"), { recursive: true });
  await mkdir(join(workspacePath, ".kayingcode"), { recursive: true });
  await writeFile(join(root, ".kayingcode", "cli", "config.json"), JSON.stringify({ hooks: USER_HOOK }));
  await writeFile(
    join(workspacePath, ".kayingcode", "config.json"),
    JSON.stringify({ hooks: PROJECT_HOOK }),
  );
  setDataBaseDir(root);
  return { root, workspacePath };
}

let cleanupRoot: string | undefined;

afterEach(async () => {
  setDataBaseDir(null);
  if (cleanupRoot) {
    await rm(cleanupRoot, { recursive: true, force: true });
    cleanupRoot = undefined;
  }
});

describe("hooks service source user scope", () => {
  it("scope=user 只读用户目录，不把 Source home 当项目", async () => {
    const { root, workspacePath } = await createFixture();
    cleanupRoot = root;
    const service = createHooksService();

    const userOnly = await service.loadHooks({ workspacePath, scope: "user" });
    expect(userOnly.hooks.map((hook) => hook.command)).toEqual(["echo user"]);
    // user scope 不产出 project snapshot：它的 workspaceIdentity 属于远端项目。
    expect(userOnly.workspaceHookSnapshot).toBeUndefined();

    // 缺省 scope 保持 workspace + user 合并语义。
    const merged = await service.loadHooks({ workspacePath });
    expect(merged.hooks.some((hook) => hook.command === "echo project")).toBe(true);
    expect(merged.hooks.some((hook) => hook.command === "echo user")).toBe(true);
    expect(merged.workspaceHookSnapshot).toBeDefined();
  });

  it("scope=user 保存时不生成项目配置", async () => {
    const { root, workspacePath } = await createFixture();
    cleanupRoot = root;
    const service = createHooksService();
    const loaded = await service.loadHooks({ workspacePath, scope: "user" });

    await service.saveHooks({ workspacePath, scope: "user", hooks: loaded.hooks });

    const projectConfigPath = join(workspacePath, ".kayingcode", "config.json");
    const projectConfig = JSON.parse(await readFile(projectConfigPath, "utf8")) as {
      hooks?: { events?: Record<string, unknown> };
    };
    // 项目配置未被写入（仍是夹具里的 PreToolUse，没有被写成 user scope 的 SessionStart）。
    expect(Object.keys(projectConfig.hooks?.events ?? {})).toEqual(["PreToolUse"]);
    expect(existsSync(join(root, ".kayingcode", "cli", "config.json"))).toBe(true);
    const userConfig = JSON.parse(
      await readFile(join(root, ".kayingcode", "cli", "config.json"), "utf8"),
    ) as { hooks?: { events?: Record<string, unknown> } };
    expect(Object.keys(userConfig.hooks?.events ?? {})).toEqual(["SessionStart"]);
  });

  it("scope=user 保存不会在空 Source home 新建项目文件", async () => {
    const root = await mkdtemp(join(tmpdir(), "kayingcode-hooks-scope-empty-"));
    cleanupRoot = root;
    await mkdir(join(root, ".kayingcode", "cli"), { recursive: true });
    await writeFile(
      join(root, ".kayingcode", "cli", "config.json"),
      JSON.stringify({ hooks: USER_HOOK }),
    );
    setDataBaseDir(root);
    const sourceHome = join(root, "source-home");
    await mkdir(sourceHome, { recursive: true });
    const service = createHooksService();
    const loaded = await service.loadHooks({ workspacePath: sourceHome, scope: "user" });

    await service.saveHooks({ workspacePath: sourceHome, scope: "user", hooks: loaded.hooks });

    assert.equal(existsSync(join(sourceHome, ".kayingcode", "config.json")), false);
  });
});
