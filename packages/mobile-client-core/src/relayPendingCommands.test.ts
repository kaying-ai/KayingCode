// 发送账本（MOB-05）单元测试：登记/overlay 过滤/ACK 收口/权威回显结算/重连对账/
// TTL 与持久化。不触碰网络；reconcile 用假 query 验证收口语义。
import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CommandAck,
  CommandsQueryResult,
  ConversationRow,
} from "@zcode/shared/kayingcode-protocol-v4";

import { RelayPendingCommandLedger } from "./relayPendingCommands.js";

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
  };
}

function makeLedger(now = 1_000) {
  const storage = memoryStorage();
  let clock = now;
  const ledger = new RelayPendingCommandLedger({ storage, now: () => clock });
  return {
    ledger,
    storage,
    advance: (ms: number) => {
      clock += ms;
    },
  };
}

function ackOf(
  commandId: string,
  status: CommandAck["status"],
  extra: Partial<CommandAck> = {},
): CommandAck {
  return { commandId, status, revisionAtDecision: 1, ...extra } as CommandAck;
}

function recordSendText(ledger: RelayPendingCommandLedger, commandId: string, sessionId: string) {
  ledger.record({
    commandId,
    kind: "sendText",
    sessionId,
    workspaceId: "ws-1",
    text: `msg-${commandId}`,
  });
}

function userRow(sourceCommandId: string | undefined): ConversationRow {
  return { kind: "userInput", text: "x", sourceCommandId } as unknown as ConversationRow;
}

test("账本：登记后按 session 过滤，createSession 挂 null 桶", () => {
  const { ledger } = makeLedger();
  recordSendText(ledger, "cmd-1", "s1");
  ledger.record({
    commandId: "cmd-2",
    kind: "createSession",
    sessionId: null,
    workspaceId: "ws-1",
    text: "new task",
  });

  assert.deepEqual(
    ledger.listForView("s1").map((entry) => entry.commandId),
    ["cmd-1"],
  );
  assert.deepEqual(
    ledger.listForView(null).map((entry) => entry.commandId),
    ["cmd-2"],
  );
  assert.equal(ledger.listForView("s2").length, 0);
  // 新条目默认"发送中"。
  assert.equal(ledger.listForView("s1")[0]?.acknowledged, false);
});

test("账本：同 commandId 重复登记幂等", () => {
  const { ledger } = makeLedger();
  recordSendText(ledger, "cmd-1", "s1");
  recordSendText(ledger, "cmd-1", "s1");
  assert.equal(ledger.listForView("s1").length, 1);
});

test("账本：ACK 收口——accepted 标记已受理保留，rejected 结算", () => {
  const { ledger } = makeLedger();
  recordSendText(ledger, "cmd-1", "s1");
  ledger.acknowledge("cmd-1", ackOf("cmd-1", "accepted"));
  assert.equal(ledger.listForView("s1")[0]?.acknowledged, true);

  recordSendText(ledger, "cmd-2", "s1");
  ledger.acknowledge("cmd-2", ackOf("cmd-2", "rejected", { reasonCode: "relay.grant.readOnly" }));
  assert.equal(
    ledger.listForView("s1").some((entry) => entry.commandId === "cmd-2"),
    false,
  );
});

test("账本：createSession 的受理 ACK 即结算（sessionId 已权威绑定）", () => {
  const { ledger } = makeLedger();
  ledger.record({
    commandId: "cmd-c",
    kind: "createSession",
    sessionId: null,
    workspaceId: "ws-1",
    text: "new task",
  });
  ledger.acknowledge("cmd-c", ackOf("cmd-c", "accepted"));
  assert.equal(ledger.listForView(null).length, 0);
});

test("账本：权威 userInput 行按 sourceCommandId 收口", () => {
  const { ledger } = makeLedger();
  recordSendText(ledger, "cmd-1", "s1");
  recordSendText(ledger, "cmd-2", "s1");
  ledger.settleFromRows([userRow("cmd-2"), userRow(undefined)]);
  assert.deepEqual(
    ledger.listForView("s1").map((entry) => entry.commandId),
    ["cmd-1"],
  );
});

test("账本：reconcile——unknown 结算并回填草稿，不自动重放", async () => {
  const { ledger } = makeLedger();
  recordSendText(ledger, "cmd-1", "s1");
  let queried: CommandsQueryResult["results"] | null = null;
  const report = await ledger.reconcile(async (commands) => {
    assert.equal(commands.length, 1);
    assert.deepEqual(commands[0], { sessionId: "s1", commandId: "cmd-1" });
    queried = [{ key: { sessionId: "s1", commandId: "cmd-1" }, result: "unknown" }];
    return { results: queried };
  });
  assert.equal(ledger.listForView("s1").length, 0);
  assert.equal(report.restoredDraft, "msg-cmd-1");
  assert.equal(report.recoveredSessionId, null);
});

test("账本：reconcile——sendText 受理保留已受理态；createSession 恢复 sessionId", async () => {
  const { ledger } = makeLedger();
  recordSendText(ledger, "cmd-1", "s1");
  ledger.record({
    commandId: "cmd-c",
    kind: "createSession",
    sessionId: null,
    workspaceId: "ws-1",
    text: "new task",
  });
  const report = await ledger.reconcile(async (commands) => ({
    results: commands.map((key) => {
      if (key.commandId === "cmd-1") {
        return { key, result: ackOf("cmd-1", "accepted") };
      }
      return {
        key,
        result: ackOf("cmd-c", "accepted", {
          result: { type: "createSession", sessionId: "s9" },
        }),
      };
    }),
  }));
  // sendText 已受理：保留等权威回显，不回填草稿。
  const pending = ledger.listForView("s1");
  assert.deepEqual(
    pending.map((entry) => entry.commandId),
    ["cmd-1"],
  );
  assert.equal(pending[0]?.acknowledged, true);
  // createSession 已收口并恢复会话。
  assert.equal(ledger.listForView(null).length, 0);
  assert.equal(report.recoveredSessionId, "s9");
  assert.equal(report.restoredDraft, null);
});

test("账本：reconcile——终态拒绝结算并回填草稿", async () => {
  const { ledger } = makeLedger();
  recordSendText(ledger, "cmd-1", "s1");
  const report = await ledger.reconcile(async (commands) => ({
    results: commands.map((key) => ({
      key,
      result: ackOf("cmd-1", "failed", { reasonCode: "fault.runtime.gone" }),
    })),
  }));
  assert.equal(ledger.listForView("s1").length, 0);
  assert.equal(report.restoredDraft, "msg-cmd-1");
});

test("账本：reconcile——空账本不发起查询；查询失败保留账本", async () => {
  const { ledger } = makeLedger();
  let queried = false;
  const empty = await ledger.reconcile(async () => {
    queried = true;
    return { results: [] };
  });
  assert.equal(queried, false);
  assert.deepEqual(empty, { recoveredSessionId: null, restoredDraft: null });

  recordSendText(ledger, "cmd-1", "s1");
  await assert.rejects(
    ledger.reconcile(async () => {
      throw new Error("socket closed");
    }),
    /socket closed/,
  );
  // 失败后账本原样保留，等下次连接。
  assert.equal(ledger.listForView("s1").length, 1);
});

test("账本：对账只查询当前工作区，保留其它桥的 pending", async () => {
  const { ledger } = makeLedger();
  recordSendText(ledger, "cmd-local", "s1");
  ledger.record({
    commandId: "cmd-other",
    kind: "sendText",
    sessionId: "s2",
    workspaceId: "ws-2",
    text: "other",
  });
  let queried: string[] = [];
  await ledger.reconcile(async (commands) => {
    queried = commands.map((command) => command.commandId);
    return { results: commands.map((key) => ({ key, result: "unknown" })) };
  }, "ws-1");
  assert.deepEqual(queried, ["cmd-local"]);
  assert.equal(ledger.listForView("s1").length, 0);
  assert.equal(ledger.listForView("s2").length, 1);
});

test("账本：TTL 过期清理且重载不复活；持久化跨实例可读", () => {
  const { ledger, storage, advance } = makeLedger();
  recordSendText(ledger, "cmd-1", "s1");
  // 持久化：新实例同 storage 可读。
  const reloaded = new RelayPendingCommandLedger({ storage, now: () => 1_001 });
  assert.equal(reloaded.listForView("s1").length, 1);

  // 超 TTL：原地清理 + 重载后不复活。
  advance(25 * 60 * 60 * 1_000);
  assert.equal(ledger.listForView("s1").length, 0);
  const afterExpiry = new RelayPendingCommandLedger({ storage, now: () => 2_000_000 });
  assert.equal(afterExpiry.listForView("s1").length, 0);
});

test("账本：clear 清空并持久化", () => {
  const { ledger, storage } = makeLedger();
  recordSendText(ledger, "cmd-1", "s1");
  ledger.clear();
  assert.equal(ledger.listForView("s1").length, 0);
  assert.equal(storage.getItem("kayingcode-relay-pending-commands:v1"), null);
});
