import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { manageMakerProjects, readLocalMakerAppId } from "../src/maker/project-management.js";
import { prepareMakerRestoreTarget } from "../src/maker/remote-project-model.js";

test("local association reads app identity and handles malformed and missing files", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "tapmaker-association-"));
  try {
    assert.equal(await readLocalMakerAppId(root), null);
    await mkdir(path.join(root, ".project"));
    await mkdir(path.join(root, ".maker-mcp"));
    await writeFile(path.join(root, ".project/project.json"), "invalid json");
    await writeFile(
      path.join(root, ".maker-mcp/config.json"),
      JSON.stringify({ project_id: "remote-id" }),
    );
    assert.equal(await readLocalMakerAppId(root), "remote-id");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("safe restore creates a child rather than replacing an unrelated nonempty directory", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "tapmaker-safe-"));
  try {
    await writeFile(path.join(root, "keep.txt"), "keep");
    const target = await prepareMakerRestoreTarget(root, "Game", "game-id");
    assert.notEqual(target.projectRoot, root);
    assert.equal(target.reusedExisting, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("management request rejects invalid operations before Maker IO", async () => {
  await assert.rejects(manageMakerProjects({ action: "restore", appId: "game" }));
});
