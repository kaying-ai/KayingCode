import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "vitest";
import { setDataBaseDir } from "../src/paths.js";
import { createCommandsService } from "../src/commands/commandsService.js";
import { createSkillsService } from "../src/skills/skillsService.js";
import { resolveModelIODirs } from "../src/kayingcode-agent/modelTrajectoryFileTail.js";

test("KayingCode user resources follow the selected Desktop data root", async () => {
  const root = await mkdtemp(join(tmpdir(), "kayingcode-desktop-user-resources-"));
  const oldHome = join(root, "old-home");
  const newBase = join(root, "new-base");
  const previousHome = process.env.HOME;
  process.env.HOME = oldHome;
  setDataBaseDir(newBase);

  try {
    const skillDir = join(newBase, ".kayingcode", "skills", "new-skill");
    await mkdir(skillDir, { recursive: true });
    await writeFile(
      join(skillDir, "SKILL.md"),
      "---\nname: new-skill\ndescription: New root\n---\n",
    );

    const commandRoot = await createCommandsService().getPrimaryUserCommandsDirectory();
    assert.equal(commandRoot.path, join(newBase, ".kayingcode", "commands"));

    const skills = await createSkillsService({ isDesktopRuntime: true }).list({
      workspacePath: join(root, "workspace"),
    });
    assert.ok(skills.skills.some((skill) => skill.name === "new-skill"));
    assert.ok(resolveModelIODirs().every((path) => path.startsWith(newBase)));
  } finally {
    setDataBaseDir(null);
    if (previousHome === undefined) delete process.env.HOME;
    else process.env.HOME = previousHome;
    await rm(root, { recursive: true, force: true });
  }
});
