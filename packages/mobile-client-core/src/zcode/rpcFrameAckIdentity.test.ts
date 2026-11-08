// rpc-frame-ack 的桥身份（宿主入站门槛的回归防线）。
//
// 宿主按 `bridgeSessionId` + `bridgeGeneration` + `recoveryId` 三项严格比对入站
// rpc-frame/ack，缺项的 ack 被静默丢弃 → 宿主的重放缓冲永不释放 → 45s 宽限后把桥
// 判降级并反复重开（实测桌面日志 remote.rpcFrame.replayGraceExceeded 每 45.6s 一次）。
import assert from "node:assert/strict";
import { test } from "vitest";
import { base64Encode } from "./wireBase64.js";
import { crc32Hex } from "./crc32.js";
import { RpcFrameTransport } from "./rpcFrameTransport.js";
import type { ZflowPayload } from "./zflowTypes.js";

const BRIDGE_ID = "bridge-1";
const BRIDGE_GENERATION = 7;
const RECOVERY_ID = "recovery-1";

/**
 * 宿主入站帧的身份门槛：三项严格相等，缺项即不匹配（`undefined !== 7`）。
 * 只有过闸的载荷会释放宿主的重放缓冲；不过闸的一律静默丢弃。
 */
function hostAcceptsFrame(
  identity: { bridgeSessionId: string; bridgeGeneration: number; recoveryId: string },
  payload: ZflowPayload,
): boolean {
  return (
    payload.bridgeSessionId === identity.bridgeSessionId &&
    payload.bridgeGeneration === identity.bridgeGeneration &&
    payload.recoveryId === identity.recoveryId
  );
}

function makeTransport(options: { bridgeGeneration?: number; recoveryId?: string } = {}): {
  transport: RpcFrameTransport;
  sent: ZflowPayload[];
} {
  const sent: ZflowPayload[] = [];
  const transport = new RpcFrameTransport({
    bridgeSessionId: BRIDGE_ID,
    ...(options.bridgeGeneration === undefined
      ? {}
      : { bridgeGeneration: options.bridgeGeneration }),
    ...(options.recoveryId === undefined ? {} : { recoveryId: options.recoveryId }),
    sendPayload: (payload) => sent.push(payload),
  });
  return { transport, sent };
}

/** 单帧入站消息（组装完成即触发 ack）。 */
function inboundSingleFrame(bytes: Uint8Array, messageSeq: number): ZflowPayload {
  return {
    zcode_type: "rpc-frame",
    bridgeSessionId: BRIDGE_ID,
    seq: 1,
    messageSeq,
    fragmentIndex: 0,
    fragmentCount: 1,
    messageBytes: bytes.length,
    checksum: { algorithm: "crc32", value: crc32Hex(bytes) },
    dataBase64: base64Encode(bytes),
  };
}

test("ack 带全桥身份：过宿主身份门槛，且键集与宿主 strict schema 一致", () => {
  const identity = {
    bridgeSessionId: BRIDGE_ID,
    bridgeGeneration: BRIDGE_GENERATION,
    recoveryId: RECOVERY_ID,
  };
  const { transport, sent } = makeTransport({
    bridgeGeneration: BRIDGE_GENERATION,
    recoveryId: RECOVERY_ID,
  });
  transport.acceptPayload(inboundSingleFrame(new Uint8Array([1, 2, 3]), 4));
  assert.equal(sent.length, 1);
  const ack = sent[0]!;
  assert.equal(hostAcceptsFrame(identity, ack), true);
  // 宿主 ack schema 是 strict 的：多一个键同样是坏帧。
  assert.deepEqual(Object.keys(ack).sort(), [
    "ackMessageSeq",
    "bridgeGeneration",
    "bridgeSessionId",
    "recoveryId",
    "zcode_type",
  ]);
  // 只带 bridgeSessionId 的 ack 正是宿主要丢的那种（重放缓冲永不释放）。
  assert.equal(
    hostAcceptsFrame(identity, {
      zcode_type: "rpc-frame-ack",
      bridgeSessionId: BRIDGE_ID,
      ackMessageSeq: 4,
    }),
    false,
  );
});

test("桥未声明 generation/recoveryId 时 ack 只带 bridgeSessionId（不多塞字段）", () => {
  const { transport, sent } = makeTransport();
  transport.acceptPayload(inboundSingleFrame(new Uint8Array([7, 8, 9]), 1));
  assert.deepEqual(sent[0], {
    zcode_type: "rpc-frame-ack",
    bridgeSessionId: BRIDGE_ID,
    ackMessageSeq: 1,
  });
});

test("换栈后 ack 用新桥身份（旧代数的帧不再被确认）", () => {
  const { transport, sent } = makeTransport({
    bridgeGeneration: BRIDGE_GENERATION,
    recoveryId: RECOVERY_ID,
  });
  transport.acceptPayload(inboundSingleFrame(new Uint8Array([1]), 1));
  const first = sent[0]!;
  assert.equal(first.bridgeGeneration, BRIDGE_GENERATION);
  // 恢复换栈：同一会话换入新身份。
  const nextGeneration = BRIDGE_GENERATION + 1;
  const nextRecoveryId = "recovery-2";
  const { transport: nextTransport, sent: nextSent } = makeTransport({
    bridgeGeneration: nextGeneration,
    recoveryId: nextRecoveryId,
  });
  nextTransport.acceptPayload(inboundSingleFrame(new Uint8Array([2]), 1));
  assert.equal(nextSent[0]!.bridgeGeneration, nextGeneration);
  assert.equal(nextSent[0]!.recoveryId, nextRecoveryId);
  assert.equal(
    hostAcceptsFrame(
      {
        bridgeSessionId: BRIDGE_ID,
        bridgeGeneration: nextGeneration,
        recoveryId: nextRecoveryId,
      },
      nextSent[0]!,
    ),
    true,
  );
});
