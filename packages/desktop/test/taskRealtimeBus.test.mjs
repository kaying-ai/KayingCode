import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import * as shared from "@zcode/shared";

const require = createRequire(new URL("../package.json", import.meta.url));
const ts = require("typescript");

test("validated mirror keeps desktop owner and relay replay on one sequence and rejects stale or malformed input", async () => {
  const source = await readFile(new URL("../src/main/taskRealtimeBus.ts", import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2024 },
  });
  const exports = {};
  const warnings = [];
  const logger = { info() {}, warn: (...args) => warnings.push(args) };
  const timers = new Set();
  runInNewContext(outputText, {
    exports,
    require: (name) => {
      if (name === "@zcode/shared") return shared;
      if (name === "./logger.js") return { logger };
      throw new Error(`Unexpected bus dependency: ${name}`);
    },
    setTimeout: (callback) => {
      const timer = { callback };
      timers.add(timer);
      return timer;
    },
    clearTimeout: (timer) => timers.delete(timer),
  });
  const bus = new exports.TaskRealtimeBus({ logger });
  const target = {
    workspacePath: "/test/project",
    workspaceIdentity: "workspace-a",
    workspaceKey: "workspace-a",
    taskId: "task",
    runId: "run",
    traceId: "run",
  };
  const children = new Map();
  const attach = (hostId, deliveryKind, workspaceKey = target.workspaceKey) => {
    const child = new EventEmitter();
    child.messages = [];
    child.postMessage = (message) => child.messages.push(message);
    children.set(hostId, child);
    bus.registerHost({
      hostId,
      windowId: children.size,
      child,
      workspaceKeys: [workspaceKey],
      deliveryKind,
    });
    return child;
  };
  const owner = attach("desktop", "desktop_window");
  const relay = attach("phone", "relay_bridge");
  const isolated = attach("isolated", "relay_bridge", "workspace-b");
  owner.emit("message", {
    type: shared.HostResponseTypes.TaskRunLeaseAcquire,
    request: { ...target, leaseRequestId: "lease" },
  });
  assert.equal(owner.messages.at(-1).result.acquired, true);
  const publish = (child, content, overrides = {}) =>
    child.emit("message", {
      type: shared.HostResponseTypes.TaskStreamOpPublish,
      target: { ...target, ...overrides },
      op: {
        kind: "stream_event",
        event: {
          type: "agent_message_chunk",
          taskId: target.taskId,
          traceId: target.traceId,
          ...(content === undefined ? {} : { content }),
        },
      },
    });
  publish(owner, "hello ");
  publish(owner, "world");
  publish(relay, "unauthorized");
  publish(owner, "stale", { runId: "stale", traceId: "stale" });
  publish(owner, undefined);
  for (const timer of timers) {
    timers.delete(timer);
    timer.callback();
  }
  const batches = (child) =>
    child.messages
      .filter((message) => message.event?.type === "task_stream_mirror_batch")
      .map((message) => message.event);
  assert.equal(batches(owner).length, 1);
  assert.equal(batches(relay).length, 1);
  assert.equal(batches(owner)[0].ops[0].event.content, "hello world");
  assert.equal(batches(owner)[0].ops[0].seq, 1);
  assert.equal(batches(owner)[0].deliveryPurpose, "relay_owner");
  assert.equal(batches(relay)[0].deliveryPurpose, "observer");
  assert.equal(batches(isolated).length, 0);
  assert.equal(warnings.length, 1);
  const reconnected = attach("reconnected-phone", "relay_bridge");
  assert.equal(batches(reconnected)[0].eventId, batches(relay)[0].eventId);
  assert.equal(batches(reconnected)[0].toSeq, 1);
  owner.emit("message", {
    type: shared.HostResponseTypes.TaskStreamOpPublish,
    target,
    op: {
      kind: "stream_event",
      event: {
        type: "task_complete",
        taskId: target.taskId,
        traceId: target.traceId,
        stopReason: "end_turn",
      },
    },
  });
  assert.equal(batches(owner).at(-1).ops[0].seq, 2);
  assert.equal(batches(reconnected).at(-1).terminal, true);
  assert.equal(bus.collectMemoryDiagnostics().leases, 0);
  assert.equal(timers.size, 0);
  for (const hostId of children.keys()) bus.unregisterHost(hostId);
});
