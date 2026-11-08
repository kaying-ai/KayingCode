import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "vitest";
import { runTasksDatabaseMigrations } from "../src/session/tasksDatabase/migrations.js";

const { DatabaseSync } = createRequire(import.meta.url)(
  "node:sqlite",
) as typeof import("node:sqlite");

function hasAdmissionsTable(db: InstanceType<typeof DatabaseSync>): boolean {
  return Boolean(
    db
      .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='task_group_admissions'")
      .get(),
  );
}

test("任务库迁移为升级库补建 task_group_admissions", () => {
  const db = new DatabaseSync(":memory:");
  try {
    // 首次迁移模拟新库；删除表和账本行后再跑一次，覆盖已有 0001-0005 的升级库。
    runTasksDatabaseMigrations(db);
    assert.equal(hasAdmissionsTable(db), true);

    db.exec("DROP TABLE task_group_admissions");
    db.prepare("DELETE FROM tasks_schema_migration WHERE id=?").run("0006_task_group_admissions");
    runTasksDatabaseMigrations(db);

    assert.equal(hasAdmissionsTable(db), true);
    db.prepare(
      "INSERT INTO task_group_admissions(workspace_key,task_id,user_organized) VALUES(?,?,1)",
    ).run("/workspace/example", "task-1");
    const row = db
      .prepare(
        "SELECT workspace_key AS workspaceKey, task_id AS taskId, user_organized AS userOrganized FROM task_group_admissions",
      )
      .get();
    assert.deepEqual(
      { ...row },
      { workspaceKey: "/workspace/example", taskId: "task-1", userOrganized: 1 },
    );
  } finally {
    db.close();
  }
});
