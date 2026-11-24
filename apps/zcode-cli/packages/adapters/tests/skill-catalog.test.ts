import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { SkillNotFoundError, type SkillLoadOutcome, type SkillRoot } from "@zcode/contracts";
import {
  createCatalogSkillPort,
  createSkillCatalogSource,
  type SkillCatalogSource,
  type SkillCatalogSourceOptions,
} from "../src/skills/catalog.js";

interface Fixture {
  root: string;
  home: string;
  workspace: string;
  userConfig: string;
  projectConfig: string;
  plugins: string;
  source?: SkillCatalogSource;
  options: SkillCatalogSourceOptions & { homeDirectory: string };
}

let fixture: Fixture;

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value));
}

async function writeSkill(directory: string, name: string): Promise<void> {
  await mkdir(directory, { recursive: true });
  await writeFile(
    join(directory, "SKILL.md"),
    `---\nname: ${name}\ndescription: ${name} skill\n---\nbody of ${name}\n`,
  );
}

function names(outcome: SkillLoadOutcome): string[] {
  return outcome.skills.map((skill) => skill.qualifiedName ?? skill.name).toSorted();
}

beforeEach(async () => {
  const root = await mkdtemp(join(tmpdir(), "kayingcode-skill-catalog-"));
  const home = join(root, "home");
  const workspace = join(root, "workspace");
  const userConfig = join(home, ".kayingcode", "cli", "config.json");
  const plugins = join(home, ".kayingcode", "cli", "plugins");
  await mkdir(plugins, { recursive: true });
  await mkdir(join(home, ".kayingcode", "skills"), { recursive: true });
  await mkdir(join(workspace, ".git"), { recursive: true });
  fixture = {
    root,
    home,
    workspace,
    userConfig,
    projectConfig: join(workspace, ".kayingcode", "config.json"),
    plugins,
    options: {
      homeDirectory: home,
      workingDirectory: workspace,
      configPaths: [join(workspace, ".kayingcode", "config.json"), userConfig],
      userConfigPath: userConfig,
      pluginStorageRoot: plugins,
      pluginRoots: [],
      bundledRoots: [],
    },
  };
});

afterEach(async () => {
  fixture.source?.close();
  await rm(fixture.root, { recursive: true, force: true });
});

describe("skill live catalog", () => {
  test("follows config, plugin enablement and skill toggles", async () => {
    const userSkill = join(fixture.home, ".kayingcode", "skills", "user-skill");
    const projectSkill = join(fixture.workspace, ".kayingcode", "skills", "project-skill");
    await writeSkill(userSkill, "user-skill");
    await writeSkill(projectSkill, "project-skill");

    const plugin = join(fixture.root, "installed", "example");
    await writeJson(join(plugin, ".kayingcode-plugin", "plugin.json"), { name: "example" });
    await writeSkill(join(plugin, "skills", "demo"), "demo");
    await writeJson(join(fixture.plugins, "installed_plugins.json"), {
      version: 1,
      plugins: [
        {
          id: "example@test",
          name: "example",
          marketplace: "test",
          version: "1.0.0",
          installPath: plugin,
          installedAt: "2026-01-01T00:00:00Z",
          updatedAt: "2026-01-01T00:00:00Z",
          scope: "user",
        },
      ],
    });
    await writeJson(fixture.userConfig, {
      plugins: { enabledPlugins: { "example@test": true } },
    });

    fixture.source = await createSkillCatalogSource(fixture.options);
    const port = createCatalogSkillPort(fixture.source);
    expect(names(port.currentCatalog())).toEqual([
      "example:demo",
      "project-skill",
      "user-skill",
    ]);

    // 项目配置禁用用户/项目 skill；工作区与用户开关分别生效。
    await writeJson(fixture.projectConfig, {
      skills: { [join(projectSkill, "SKILL.md")]: { enable: false } },
    });
    await fixture.source.flush();
    expect(names(port.currentCatalog())).toEqual(["example:demo", "user-skill"]);

    // 插件停用后其 skill 从快照消失。
    await writeJson(fixture.userConfig, {
      plugins: { enabledPlugins: { "example@test": false } },
    });
    await fixture.source.flush();
    expect(names(port.currentCatalog())).toEqual(["user-skill"]);

    const content = await port.loadSkill({ name: "user-skill" });
    expect(content.content).toContain("body of user-skill");
    await expect(port.loadSkill({ name: "missing-skill" })).rejects.toBeInstanceOf(
      SkillNotFoundError,
    );
    port.close();
  });

  test("excludes visualize-style plugins when the host has no inline surface", async () => {
    const bundled: SkillRoot = {
      path: join(fixture.root, "bundled"),
      priority: 1_000_000,
      scope: "system",
      source: "bundled",
    };
    await writeSkill(join(bundled.path, "builtin"), "builtin");
    await mkdir(join(fixture.workspace, ".kayingcode"), { recursive: true });
    fixture.source = await createSkillCatalogSource({
      ...fixture.options,
      bundledRoots: [bundled],
      excludedPluginIds: ["visualize@kayingcode-plugins-official"],
    });
    const port = createCatalogSkillPort(fixture.source);
    expect(names(port.currentCatalog())).toContain("builtin");
    port.close();
  });
});
