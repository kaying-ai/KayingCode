import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { test } from "vitest";
import { TaskIndexRepo } from "../src/session/taskIndexRepo.js";
import { setDataBaseDir } from "../src/paths.js";

const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");

function tableNames(path: string): string[] {
  const db = new DatabaseSync(path);
  try {
    return (
      db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as {
        name: string;
      }[]
    ).map((row) => row.name);
  } finally {
    db.close();
  }
}

test("TaskIndexRepo creates project storage tables for a fresh database", async () => {
  const root = await mkdtemp(join(tmpdir(), "kayingcode-project-storage-"));
  setDataBaseDir(root);
  const dbPath = join(root, "tasks-index.sqlite");
  try {
    const repo = new TaskIndexRepo(dbPath);
    await repo.ensureReady();
    repo.close();

    const tables = tableNames(dbPath);
    for (const table of ["hosts", "projects", "project_roots", "remote_project_entries"]) {
      assert.ok(tables.includes(table), `missing table: ${table}`);
    }
    // 本地 Host 行由项目迁移确保存在；空库也必须有可挂载项目的 owner。
    const db = new DatabaseSync(dbPath);
    try {
      const hosts = db.prepare("SELECT host_id, kind FROM hosts").all() as {
        host_id: string;
        kind: string;
      }[];
      assert.ok(hosts.some((host) => host.host_id === "local"));
    } finally {
      db.close();
    }
  } finally {
    setDataBaseDir(null);
    await rm(root, { recursive: true, force: true });
  }
});

test("project migration is idempotent and seeds projects from legacy settings once", async () => {
  const root = await mkdtemp(join(tmpdir(), "kayingcode-project-seed-"));
  setDataBaseDir(root);
  const dbPath = join(root, "tasks-index.sqlite");
  const workspacePath = join(root, "workspace-a");
  const settings = {
    lastWorkspaceSession: [
      {
        kind: "local" as const,
        workspacePath,
        workspacePurpose: "project" as const,
      },
    ],
  };
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const repo = new TaskIndexRepo(dbPath, 5_000, undefined, settings);
      await repo.ensureReady();
      if (attempt === 1) {
        const projectRepo = await repo.getProjectRepository();
        const project = projectRepo.readTree({ includeTasks: false }).projects[0]!;
        // Host 在 CLI 创建前预留归属：任务行必须立即落在项目下，重复初始化不覆盖。
        projectRepo.reserveCreatedTask({
          task: { taskId: "session_reserved", workspacePath },
          projectId: project.id,
        });
      }
      repo.close();
    }

    const db = new DatabaseSync(dbPath);
    try {
      const rows = db
        .prepare(
          `SELECT p.name, r.root_path FROM projects p
           JOIN project_roots r USING(project_id)
           WHERE p.deleted=0 ORDER BY r.root_path`,
        )
        .all() as { name: string; root_path: string }[];
      assert.equal(rows.length, 1);
      assert.equal(rows[0]!.name, "workspace-a");
      assert.equal(rows[0]!.root_path, workspacePath);
      const reserved = db
        .prepare("SELECT project_id, host_id FROM tasks WHERE task_id=?")
        .get("session_reserved") as { project_id: string; host_id: string } | undefined;
      assert.ok(reserved, "reserved task row should exist");
      assert.equal(reserved.host_id, "local");
      assert.ok(reserved.project_id.length > 0);
    } finally {
      db.close();
    }
  } finally {
    setDataBaseDir(null);
    await rm(root, { recursive: true, force: true });
  }
});
