import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { Recordings } from "../runtime/media.mjs";

test("recording finalizes and probes media before registering, reports early exit honestly", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "playtest-recorder-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "recordings"));
  let child, argv;
  const fakeSpawn = (_command, args) => {
    argv = args;
    child = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = () => {
      queueMicrotask(() => child.emit("close", 0));
      return true;
    };
    queueMicrotask(() => child.emit("spawn"));
    return child;
  };
  const session = {
    id: "test",
    source: { kind: "android" },
    device: { serial: "test-device" },
    createdAt: new Date().toISOString(),
    artifacts: [],
  };
  let probeFails = false;
  const executor = async (_command, args) => {
    if (args.includes("-show_entries")) {
      if (probeFails) throw new Error("corrupt media");
      return Buffer.from('{"format":{"duration":"2.5"}}');
    }
    return Buffer.from("version");
  };
  const recordings = new Recordings(executor, fakeSpawn);
  await recordings.start(session, root, Date.now());
  assert.ok(argv.includes("--no-audio"));
  assert.ok(argv.includes("--max-fps=15"));
  assert.ok(argv.includes("--time-limit=60"));
  const file = argv.find((arg) => arg.startsWith("--record=")).slice(9);
  await writeFile(file, Buffer.alloc(64));
  const result = await recordings.stop(session, root, Date.now() + 3000);
  assert.equal(result.artifact.durationSeconds, 2.5);
  assert.equal(session.recording.status, "finalized");
  assert.equal(session.artifacts.length, 1);
  await recordings.start(session, root, Date.now(), { durationSeconds: 5 });
  assert.ok(argv.includes("--time-limit=5"));
  await writeFile(argv.find((arg) => arg.startsWith("--record=")).slice(9), Buffer.alloc(64));
  child.kill = () => {
    throw new Error("Natural completion must not receive another signal");
  };
  child.emit("close", 0);
  await recordings.stop(session, root, Date.now());
  assert.equal(session.artifacts.length, 2);
  await recordings.start(session, root, Date.now());
  child.stderr.emit("data", Buffer.from("device disconnected"));
  child.emit("close", 1);
  assert.equal(recordings.status(session).status, "failed");
  await assert.rejects(recordings.stop(session, root, Date.now()));
  assert.equal(session.artifacts.length, 2);
  await recordings.start(session, root, Date.now());
  await writeFile(argv.find((arg) => arg.startsWith("--record=")).slice(9), Buffer.alloc(64));
  probeFails = true;
  await assert.rejects(recordings.stop(session, root, Date.now()), /corrupt media/);
  assert.equal(session.artifacts.length, 2);
});
