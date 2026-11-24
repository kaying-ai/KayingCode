import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, expect, it } from "vitest";
import { runSqliteSessionMigrations } from "../src/storage/session-store/migration-runner.js";

const roots: string[] = [];

afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

it("applies permanent deletion tables and the dwf parent session index", async () => {
  const root = await mkdtemp(join(tmpdir(), "kayingcode-session-migrations-"));
  roots.push(root);
  const db = new DatabaseSync(join(root, "sessions.db"));
  try {
    await runSqliteSessionMigrations(db, join(root, "sessions.db"));
    const tables = db
      .prepare(
        "select name from sqlite_master where type='table' and name in ('session_purge','session_runtime_presence') order by name",
      )
      .all()
      .map((row) => row.name);
    expect(tables).toEqual(["session_purge", "session_runtime_presence"]);
    const index = db
      .prepare("select name from sqlite_master where type='index' and name='dwf_run_parent_session_idx'")
      .get();
    expect(index?.name).toBe("dwf_run_parent_session_idx");
    const artifactTrigger = db
      .prepare(
        "select sql from sqlite_master where type='trigger' and name='session_purge_reference_part_data_insert'",
      )
      .get() as { sql?: string } | undefined;
    expect(artifactTrigger?.sql).toContain("kayingcode-artifact://");
  } finally {
    db.close();
  }
});
