import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import type { SessionId } from "@zcode/contracts";
import { SqliteSessionStore } from "../src/storage/session-store/sqlite-session-store.js";
import { inspectSessionDeletions } from "../src/storage/session-store/repositories/sessions.js";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function setup() {
  const root = await mkdtemp(join(tmpdir(), "kayingcode-permanent-delete-"));
  roots.push(root);
  const store = await SqliteSessionStore.open({ dbPath: join(root, "db.sqlite") });
  const session = (id: string, parentID?: string, taskType = "interactive") =>
    store.createSession({
      id: id as SessionId,
      projectID: "project" as never,
      slug: id,
      directory: "/work/example",
      title: id,
      version: "1",
      parentID: parentID as SessionId | undefined,
      taskType: taskType as never,
    });
  await session("root");
  await session("child", "root", "subagent_child");
  await session("fork", "root", "fork");
  return { store, session };
}

describe("永久删除存储", () => {
  it("准入凭据阻止重建和运行态注册，删除 owned tree 但保留独立 fork", async () => {
    const { store, session } = await setup();
    try {
      const preview = await store.inspectSessionDeletion("root" as SessionId);
      expect(preview.sessionIds.sort()).toEqual(["child", "root"]);
      expect(preview.forks.map((fork) => fork.sessionId)).toEqual(["fork"]);
      await store.beginSessionDeletion("root" as SessionId, preview.revision, "operation", []);
      await expect(store.registerSessionRuntime("root" as SessionId)).rejects.toThrow(
        "session-data.deleting",
      );
      // 删除中的会话立即从普通读取与列表隐藏，但行仍在，重试可继续完成。
      expect(await store.getSession("root" as SessionId)).toBeNull();
      expect((await store.listSessions()).map((session) => session.id)).not.toContain("root");
      await store.completeSessionDeletion("root" as SessionId);
      expect(await store.getSession("root" as SessionId)).toBeNull();
      expect(await store.getSession("child" as SessionId)).toBeNull();
      expect(await store.getSession("fork" as SessionId)).not.toBeNull();
      await expect(session("root")).rejects.toThrow("session-data.deleting");
      await store.completeSessionDeletion("root" as SessionId);
    } finally {
      store.close();
    }
  });

  it("确认后出现新子会话时不接受旧计划", async () => {
    const { store, session } = await setup();
    try {
      const preview = await store.inspectSessionDeletion("root" as SessionId);
      await session("newchild", "root", "subagent_child");
      await expect(
        store.beginSessionDeletion("root" as SessionId, preview.revision, "operation", []),
      ).rejects.toThrow("session-data.changed");
      expect(await store.getSession("root" as SessionId)).not.toBeNull();
    } finally {
      store.close();
    }
  });
});

/** 只统计引用扫描 SQL（含 kayingcode-artifact:// 的 13 条），其余 prepare 原样透传。 */
function countingReferenceScans(db: DatabaseSync) {
  const counter = { scans: 0 };
  const proxy = new Proxy(db, {
    get(target, property) {
      if (property === "prepare")
        return (sql: string) => {
          if (sql.includes("kayingcode-artifact://")) counter.scans++;
          return target.prepare(sql);
        };
      const value = Reflect.get(target, property, target) as unknown;
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  return { db: proxy, counter };
}

describe("批量删除预检", () => {
  async function batchSetup() {
    const root = await mkdtemp(join(tmpdir(), "kayingcode-permanent-delete-batch-"));
    roots.push(root);
    const dbPath = join(root, "db.sqlite");
    const store = await SqliteSessionStore.open({ dbPath });
    const db = new DatabaseSync(dbPath);
    const session = (id: string, parentID?: string, taskType = "interactive") =>
      store.createSession({
        id: id as SessionId,
        projectID: "project" as never,
        slug: id,
        directory: "/work/example",
        title: `标题-${id}`,
        version: "1",
        parentID: parentID as SessionId | undefined,
        taskType: taskType as never,
      });
    let seq = 0;
    const part = (sessionId: string, url: string) => {
      const id = `ref-${seq++}`;
      db.prepare(
        "INSERT INTO message(id,session_id,time_created,time_updated,data) VALUES(?,?,1,1,'{}')",
      ).run(`${id}-m`, sessionId);
      db.prepare(
        "INSERT INTO part(id,message_id,session_id,time_created,time_updated,data) VALUES(?,?,?,1,1,?)",
      ).run(id, `${id}-m`, sessionId, JSON.stringify({ url }));
    };
    return {
      store,
      db,
      session,
      part,
      close: () => {
        db.close();
        store.close();
      },
    };
  }

  it("批量与逐个预检结果完全一致：跨根引用、树内引用、fork、工作流 journal 与续删回执", async () => {
    const { store, db, session, part, close } = await batchSetup();
    try {
      await session("a");
      await session("a-child", "a", "subagent_child");
      await session("a-fork", "a", "fork");
      await session("b");
      await session("c");
      await session("d");
      await session("kept");
      // a 的产物被同批 b 引用：以 a 的视角 b 在树外，必须算外部引用。
      part("b", "kayingcode-artifact://a/shared");
      // 同一树内的引用随根删除，不算外部引用。
      part("a-child", "kayingcode-artifact://a/private");
      // b 的产物被 a 的附属会话引用；fork 也引用 a。
      part("a-child", "kayingcode-artifact://b/report");
      part("a-fork", "kayingcode-artifact://a/shared");
      // c 的产物只出现在保留会话的工作流 journal 里。
      db.exec(`INSERT INTO dwf_run(id,parent_session_id,caps_max_concurrency,status,time_created,time_updated) VALUES('run','kept',1,'completed',1,1);
        INSERT INTO dwf_event(run_id,sequence,type,payload_json,time_created) VALUES('run',1,'artifact','{"uri":"kayingcode-artifact://c/chart"}',1);`);
      // d 已进入删除中：回执里保留的附件即使没有引用方也要出现在 references。
      const fresh = await store.inspectSessionDeletion("d" as SessionId);
      await store.beginSessionDeletion("d" as SessionId, fresh.revision, "op", [
        { sessionId: "d" as SessionId, artifactId: "kept-file" },
      ]);
      const ids = ["a", "b", "c", "d", "missing"] as SessionId[];
      const single = [];
      for (const id of ids) single.push(await store.inspectSessionDeletion(id));
      const batch = await store.inspectSessionDeletions(ids.map((sessionId) => ({ sessionId })));
      expect(batch).toEqual(single);
      expect(batch[0]!.forks.map((fork) => fork.sessionId)).toEqual(["a-fork"]);
      expect(batch[0]!.references).toEqual([
        {
          sessionId: "a",
          artifactId: "shared",
          referrers: [
            { sessionId: "a-fork", title: "标题-a-fork" },
            { sessionId: "b", title: "标题-b" },
          ],
        },
      ]);
      expect(batch[1]!.references.map((ref) => ref.referrers[0]!.sessionId)).toEqual(["a-child"]);
      expect(batch[2]!.references.map((ref) => ref.referrers[0]!.sessionId)).toEqual(["kept"]);
      expect(batch[3]).toMatchObject({
        deleting: true,
        references: [{ sessionId: "d", artifactId: "kept-file", referrers: [] }],
      });
      expect(batch[4]!.sessionIds).toEqual([]);
      // 扫描判定相同时，批量与逐个结果也一致；回执里有保留附件的根仍会扫描。
      const flags = ids.map((sessionId, index) => ({
        sessionId,
        scanArtifactReferences: index % 2 === 0,
      }));
      const singleFlags = [];
      for (const target of flags)
        singleFlags.push(
          await store.inspectSessionDeletion(target.sessionId, {
            scanArtifactReferences: target.scanArtifactReferences,
          }),
        );
      expect(await store.inspectSessionDeletions(flags)).toEqual(singleFlags);
      // 重复目标各自独立计算。
      expect(
        await store.inspectSessionDeletions([
          { sessionId: "a" as SessionId },
          { sessionId: "a" as SessionId },
        ]),
      ).toEqual([single[0], single[0]]);
    } finally {
      close();
    }
  });

  it("无产物的根不执行引用扫描；写锁内复检沿用同一判定", async () => {
    const { store, db, session, part, close } = await batchSetup();
    try {
      await session("a");
      await session("b");
      part("b", "kayingcode-artifact://a/lost");
      const counted = countingReferenceScans(db);
      const skipped = inspectSessionDeletions(
        counted.db,
        [
          { root: "a" as SessionId, scanArtifactReferences: false },
          { root: "b" as SessionId, scanArtifactReferences: false },
        ],
        "owner",
      );
      expect(counted.counter.scans).toBe(0);
      // 产物文件不存在时不再列入保留附件（规格：只对实际存在产物文件的会话扫描）。
      expect(skipped[0]!.references).toEqual([]);
      const scanned = inspectSessionDeletions(counted.db, [{ root: "a" as SessionId }], "owner");
      expect(counted.counter.scans).toBe(13);
      expect(scanned[0]!.references.map((ref) => ref.artifactId)).toEqual(["lost"]);
      // 预检用 false 得到的 revision，写锁内必须用同一判定才能通过；用不同判定会被视为清单变化。
      await expect(
        store.beginSessionDeletion("a" as SessionId, skipped[0]!.revision, "op", []),
      ).rejects.toThrow("session-data.changed");
      await store.beginSessionDeletion("a" as SessionId, skipped[0]!.revision, "op", [], {
        scanArtifactReferences: false,
      });
      expect((await store.inspectSessionDeletion("a" as SessionId)).deleting).toBe(true);
    } finally {
      close();
    }
  });

  it("300 个会话整批只跑一轮引用 SQL，结果与逐个一致", async () => {
    const { store, db, session, part, close } = await batchSetup();
    try {
      const ids: SessionId[] = [];
      for (let index = 0; index < 300; index++) {
        const id = `s${String(index).padStart(3, "0")}`;
        await session(id);
        ids.push(id as SessionId);
      }
      // 每个会话引用下一个会话的产物，形成跨根引用链。
      for (let index = 0; index < 300; index++)
        part(ids[index]!, `kayingcode-artifact://${ids[(index + 1) % 300]}/file-${index}`);
      const counted = countingReferenceScans(db);
      const single = ids.map(
        (root) => inspectSessionDeletions(counted.db, [{ root }], "owner")[0]!,
      );
      expect(counted.counter.scans).toBe(300 * 13);
      counted.counter.scans = 0;
      const batch = inspectSessionDeletions(
        counted.db,
        ids.map((root) => ({ root })),
        "owner",
      );
      expect(counted.counter.scans).toBe(13);
      expect(batch).toEqual(single);
      expect(batch[1]!.references[0]!.referrers).toEqual([
        { sessionId: "s000", title: "标题-s000" },
      ]);
    } finally {
      close();
    }
  });
});
